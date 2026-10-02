import { randomBytes } from 'node:crypto';
import { createError, getHeader, type H3Event } from 'h3';
import { z } from 'zod';
import type { AuthResult, ReauthPurpose } from '~/types/auth';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import prisma from '~/server/utils/prisma';
import { hashToken } from '~/server/utils/token-hash';
import {
    assertAuthState,
    createAuthSession,
    getAuthContext,
    type AuthContext
} from '~/server/utils/auth';
import { sendTwoFactorEmailCode } from '~/server/utils/mailer';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { ensureAuthFlowHash, assertAuthFlowHash } from '~/server/utils/auth-flow';
import {
    authChallengeExpired,
    build2faLoginChallengeKey,
    claimTotpCode,
    consumeChallengeAttempt,
    decryptTotpSecret,
    deleteRedisKeyIfValue,
    generateSixDigitCode,
    getRedisJsonWithRaw,
    hashCode,
    setRedisJson,
    verifyCodeHash,
    verifyTotp
} from '~/server/utils/security';

export const reauthPurposeSchema = z.enum([
    'email_change',
    'password_change',
    'mfa_change',
    'passkey_add',
    'passkey_delete',
    'binding_change'
]);
export type PrimaryAuthenticationContext = {
    redirect: string;
    mode: 'login' | 'register' | 'reauth';
    purpose?: ReauthPurpose;
    sessionId?: string;
    authVersion?: number;
};
const challengeSchema = z
    .object({
        userId: z.string().min(1),
        authVersion: z.number().int().nonnegative(),
        method: z.enum(['email_otp', 'totp']),
        redirect: z.string(),
        mode: z.enum(['login', 'register', 'reauth']),
        purpose: reauthPurposeSchema.optional(),
        sessionId: z.string().optional(),
        codeHash: z.string().optional(),
        flowHash: z.string()
    })
    .strict();
const proofSchema = z
    .object({
        userId: z.string().min(1),
        sessionId: z.string(),
        authVersion: z.number().int().nonnegative(),
        purpose: reauthPurposeSchema
    })
    .strict();

async function finishAuthentication(
    event: H3Event,
    userId: string,
    authVersion: number,
    context: PrimaryAuthenticationContext
): Promise<AuthResult> {
    const redirect = getSafeRedirectTarget(context.redirect);
    if (context.mode !== 'reauth') {
        await createAuthSession(event, userId, authVersion);
        return { authenticated: true, redirect };
    }
    const auth = getAuthContext(event);
    if (
        !context.purpose ||
        auth.userId !== userId ||
        auth.sessionId !== context.sessionId ||
        auth.authVersion !== authVersion
    ) {
        throw createError({
            statusCode: 401,
            message: 'Authentication state has changed',
            data: { code: 'AUTH_STATE_CHANGED' }
        });
    }
    await assertAuthState(event, auth);
    const reauthToken = randomBytes(32).toString('base64url');
    await setRedisJson(
        `cp-oauth:v2:auth:reauth:${hashToken(reauthToken)}`,
        {
            userId,
            sessionId: auth.sessionId,
            authVersion,
            purpose: context.purpose
        },
        300
    );
    return { reauthToken, expiresIn: 300, purpose: context.purpose, redirect };
}

export async function completePrimaryAuthentication(
    event: H3Event,
    userId: string,
    context: PrimaryAuthenticationContext
): Promise<AuthResult> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            authVersion: true,
            email: true,
            emailVerified: true,
            twoFactorEnabled: true,
            twoFactorMethod: true
        }
    });
    if (!user || (context.authVersion !== undefined && user.authVersion !== context.authVersion)) {
        throw createError({
            statusCode: 401,
            message: 'Authentication state has changed',
            data: { code: 'AUTH_STATE_CHANGED' }
        });
    }
    const redirect = getSafeRedirectTarget(context.redirect);
    if (context.mode === 'reauth') {
        const auth = getAuthContext(event);
        if (
            !context.purpose ||
            auth.userId !== userId ||
            auth.sessionId !== context.sessionId ||
            auth.authVersion !== user.authVersion
        ) {
            throw createError({
                statusCode: 401,
                message: 'Authentication state has changed',
                data: { code: 'AUTH_STATE_CHANGED' }
            });
        }
        await assertAuthState(event, auth);
    }
    if (!user.twoFactorEnabled)
        return finishAuthentication(event, userId, user.authVersion, context);
    if (user.twoFactorMethod !== 'email_otp' && user.twoFactorMethod !== 'totp') {
        throw createError({ statusCode: 503, message: 'Two-factor authentication is unavailable' });
    }
    let codeHash: string | undefined;
    if (user.twoFactorMethod === 'email_otp') {
        if (!user.emailVerified) {
            throw createError({
                statusCode: 403,
                message: 'A verified email is required for email authentication'
            });
        }
        await enforceRateLimit(event, 'email', user.email);
        const code = generateSixDigitCode();
        codeHash = await hashCode(code);
        if (!(await sendTwoFactorEmailCode(user.email, code))) {
            throw createError({ statusCode: 503, message: 'Unable to send authentication email' });
        }
    }
    const challengeId = randomBytes(32).toString('base64url');
    await setRedisJson(
        build2faLoginChallengeKey(challengeId),
        {
            userId,
            authVersion: user.authVersion,
            method: user.twoFactorMethod,
            redirect,
            mode: context.mode,
            purpose: context.purpose,
            sessionId: context.sessionId,
            codeHash,
            flowHash: ensureAuthFlowHash(event)
        },
        600
    );
    return { requiresTwoFactor: true, method: user.twoFactorMethod, challengeId, redirect };
}

export async function completeTwoFactorAuthentication(
    event: H3Event,
    challengeId: string,
    code: string
): Promise<AuthResult> {
    await enforceRateLimit(event, 'mfa');
    const key = build2faLoginChallengeKey(challengeId);
    const entry = await getRedisJsonWithRaw<unknown>(key);
    if (!entry) authChallengeExpired();
    const parsed = challengeSchema.safeParse(entry.value);
    if (!parsed.success) authChallengeExpired();
    const challenge = parsed.data;
    assertAuthFlowHash(event, challenge.flowHash);
    const user = await prisma.user.findUnique({
        where: { id: challenge.userId },
        select: {
            authVersion: true,
            twoFactorEnabled: true,
            twoFactorMethod: true,
            totpSecret: true,
            emailVerified: true
        }
    });
    if (
        !user ||
        user.authVersion !== challenge.authVersion ||
        !user.twoFactorEnabled ||
        user.twoFactorMethod !== challenge.method ||
        (challenge.method === 'email_otp' && !user.emailVerified)
    )
        authChallengeExpired();
    if (challenge.mode === 'reauth') {
        const auth = getAuthContext(event);
        if (
            auth.userId !== challenge.userId ||
            auth.sessionId !== challenge.sessionId ||
            auth.authVersion !== challenge.authVersion ||
            !challenge.purpose
        )
            authChallengeExpired();
        await assertAuthState(event, auth);
    }
    await consumeChallengeAttempt(event, key);
    let valid = false;
    if (challenge.method === 'email_otp') {
        valid = !!challenge.codeHash && (await verifyCodeHash(code, challenge.codeHash));
    } else if (user.totpSecret) {
        valid = await verifyTotp(decryptTotpSecret(user.totpSecret, challenge.userId), code);
    }
    if (!valid) {
        throw createError({
            statusCode: 401,
            message: 'Invalid verification code',
            data: { code: 'INVALID_MFA_CODE' }
        });
    }
    if (challenge.method === 'totp') await claimTotpCode(challenge.userId, code);
    if (!(await deleteRedisKeyIfValue(key, entry.raw))) authChallengeExpired();
    return finishAuthentication(event, challenge.userId, challenge.authVersion, challenge);
}

export async function requireFreshReauthentication(
    event: H3Event,
    purpose: ReauthPurpose,
    token?: string
): Promise<AuthContext> {
    const auth = getAuthContext(event);
    const proofToken = token === undefined ? getHeader(event, 'x-cp-oauth-reauth') : token;
    if (!proofToken || !/^[A-Za-z0-9_-]{43}$/.test(proofToken)) {
        throw createError({
            statusCode: 403,
            message: 'Confirm your identity before continuing',
            data: { code: 'REAUTH_REQUIRED' }
        });
    }
    const key = `cp-oauth:v2:auth:reauth:${hashToken(proofToken)}`;
    const entry = await getRedisJsonWithRaw<unknown>(key);
    const parsed = proofSchema.safeParse(entry?.value);
    if (
        !entry ||
        !parsed.success ||
        parsed.data.purpose !== purpose ||
        parsed.data.userId !== auth.userId ||
        parsed.data.sessionId !== auth.sessionId ||
        parsed.data.authVersion !== auth.authVersion
    ) {
        throw createError({
            statusCode: 403,
            message: 'Identity confirmation expired; please confirm again',
            data: { code: 'REAUTH_REQUIRED' }
        });
    }
    await assertAuthState(event, auth);
    if (!(await deleteRedisKeyIfValue(key, entry.raw))) {
        throw createError({
            statusCode: 403,
            message: 'Identity confirmation has already been used',
            data: { code: 'REAUTH_REQUIRED' }
        });
    }
    return auth;
}
