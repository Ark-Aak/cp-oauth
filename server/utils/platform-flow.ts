import { randomBytes } from 'node:crypto';
import { createError, type H3Event } from 'h3';
import { z } from 'zod';
import type { ReauthPurpose } from '~/types/auth';
import type { VerifiablePlatform } from '~/utils/platforms';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { assertAuthState, type AuthContext } from './auth';
import prisma from './prisma';
import { getPlatformVerifier } from './platforms';
import { enforceRateLimit } from './rate-limit';
import { consumeChallengeAttempt } from './security';
import { hashToken } from './token-hash';
import {
    AUTH_RANDOM_ID_PATTERN,
    ensureAuthFlowHash,
    assertAuthFlowHash,
    storeAuthFlow,
    readAuthFlow,
    consumeAuthFlow
} from './auth-flow';

export const verifiablePlatformSchema = z.enum(['luogu', 'atcoder', 'leetcode']);
export const platformUidSchema = z.string().trim().min(1).max(100);
export const platformChallengeIdSchema = z.string().regex(AUTH_RANDOM_ID_PATTERN);

export type PlatformChallengeMode = 'login' | 'register' | 'bind' | 'reauth';
export interface PlatformChallengeState {
    mode: PlatformChallengeMode;
    platform: VerifiablePlatform;
    platformUid: string;
    redirect: string;
    flowHash: string;
    code: string;
    auth?: AuthContext;
    userId?: string;
    authVersion?: number;
    purpose?: ReauthPurpose;
}

export interface PendingPlatformChallenge {
    key: string;
    raw: string;
    state: PlatformChallengeState;
}

export function normalizePlatformUid(platform: VerifiablePlatform, value: string): string {
    const uid = value.trim();
    if (platform !== 'luogu') return uid;
    if (!/^\d{1,20}$/.test(uid) || BigInt(uid) <= 0n) {
        throw createError({
            statusCode: 400,
            message: 'Luogu UID must be a positive decimal number'
        });
    }
    return BigInt(uid).toString();
}

async function assertPlatformChallenge(
    event: H3Event,
    state: PlatformChallengeState
): Promise<void> {
    assertAuthFlowHash(event, state.flowHash);
    if (state.auth) await assertAuthState(event, state.auth);
    if (state.mode === 'login') {
        const linked = await prisma.linkedAccount.findUnique({
            where: {
                platform_platformUid: { platform: state.platform, platformUid: state.platformUid }
            },
            select: { userId: true, user: { select: { authVersion: true } } }
        });
        if (
            !linked ||
            linked.userId !== state.userId ||
            linked.user.authVersion !== state.authVersion
        ) {
            throw createError({
                statusCode: 400,
                message: 'This account binding or authentication challenge is no longer valid',
                data: { code: 'AUTH_CHALLENGE_EXPIRED' }
            });
        }
    }
}

export async function createPlatformChallenge(
    event: H3Event,
    input: Omit<PlatformChallengeState, 'flowHash' | 'code'>
): Promise<{ requestId: string; code: string; expiresIn: 600 }> {
    const requestId = randomBytes(32).toString('base64url');
    const state: PlatformChallengeState = {
        ...input,
        platformUid: normalizePlatformUid(input.platform, input.platformUid),
        redirect: getSafeRedirectTarget(input.redirect),
        flowHash: ensureAuthFlowHash(event),
        code: `CPOAUTH-${randomBytes(16).toString('hex').toUpperCase()}`
    };
    if (state.auth) await assertAuthState(event, state.auth);
    await storeAuthFlow(`cp-oauth:v2:auth:platform:${hashToken(requestId)}`, state);
    return { requestId, code: state.code, expiresIn: 600 };
}

export async function readPlatformChallenge(
    event: H3Event,
    requestId: string,
    expected: { mode: PlatformChallengeMode; platform?: VerifiablePlatform }
): Promise<PendingPlatformChallenge> {
    if (!AUTH_RANDOM_ID_PATTERN.test(requestId)) {
        throw createError({
            statusCode: 400,
            message: 'Invalid platform challenge',
            data: { code: 'AUTH_CHALLENGE_EXPIRED' }
        });
    }
    const key = `cp-oauth:v2:auth:platform:${hashToken(requestId)}`;
    const pending = await readAuthFlow<PlatformChallengeState>(key);
    const state = pending.value;
    if (
        state.mode !== expected.mode ||
        (expected.platform && state.platform !== expected.platform)
    ) {
        throw createError({
            statusCode: 400,
            message: 'Invalid platform challenge',
            data: { code: 'AUTH_CHALLENGE_EXPIRED' }
        });
    }
    await assertPlatformChallenge(event, state);
    return { key, raw: pending.raw, state };
}

export async function verifyPlatformChallenge(
    event: H3Event,
    pending: PendingPlatformChallenge,
    credential: string
) {
    await enforceRateLimit(event, 'mfa');
    await consumeChallengeAttempt(event, pending.key);
    const verifier = getPlatformVerifier(pending.state.platform);
    if (!verifier)
        throw createError({ statusCode: 400, message: 'Unsupported verification platform' });
    const result = await verifier.verify({
        platformUid: pending.state.platformUid,
        code: pending.state.code,
        credential
    });
    if (!result.success || result.platformUid !== pending.state.platformUid) {
        throw createError({
            statusCode: 400,
            message: result.error || 'Platform ownership verification failed'
        });
    }
    return result;
}

export async function consumePlatformChallenge(
    event: H3Event,
    pending: PendingPlatformChallenge
): Promise<void> {
    await assertPlatformChallenge(event, pending.state);
    await consumeAuthFlow(pending.key, pending.raw);
}
