import { createError, type H3Event } from 'h3';
import { z } from 'zod';
import type { VerifiablePlatform } from '~/utils/platforms';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import prisma from './prisma';
import { parseBody } from './validation';
import { requireRegistrationEnabled } from './config';
import { enforceRateLimit } from './rate-limit';
import { verifyTurnstileToken } from './turnstile';
import { completePrimaryAuthentication } from './auth-completion';
import { createUserWithLinkedIdentity } from './thirdparty-auth';
import {
    createPlatformChallenge,
    normalizePlatformUid,
    platformUidSchema,
    platformChallengeIdSchema,
    readPlatformChallenge,
    verifyPlatformChallenge,
    consumePlatformChallenge
} from './platform-flow';

const requestSchema = z.strictObject({
    platformUid: platformUidSchema,
    redirect: z.string().optional(),
    turnstileToken: z.string().max(4096).optional()
});
const verifySchema = z.strictObject({
    requestId: platformChallengeIdSchema,
    credential: z.string().trim().min(1).max(2048)
});

type RegistrationPlatform = Extract<VerifiablePlatform, 'luogu' | 'leetcode'>;

// These explicit registration APIs have no UI entry and are not a Luogu login fallback.
export async function requestPlatformRegistration(event: H3Event, platform: RegistrationPlatform) {
    const body = await parseBody(event, requestSchema);
    await requireRegistrationEnabled();
    const platformUid = normalizePlatformUid(platform, body.platformUid);
    await enforceRateLimit(event, 'register');
    await enforceRateLimit(event, 'challenge', `${platform}:${platformUid}`);
    await verifyTurnstileToken({ token: body.turnstileToken, action: 'register' });
    const taken = await prisma.linkedAccount.findUnique({
        where: { platform_platformUid: { platform, platformUid } },
        select: { id: true }
    });
    if (taken)
        throw createError({ statusCode: 409, message: 'This platform account is already linked' });
    return createPlatformChallenge(event, {
        platform,
        platformUid,
        mode: 'register',
        redirect: getSafeRedirectTarget(body.redirect)
    });
}

export async function verifyPlatformRegistration(event: H3Event, platform: RegistrationPlatform) {
    const body = await parseBody(event, verifySchema);
    await requireRegistrationEnabled();
    const pending = await readPlatformChallenge(event, body.requestId, {
        mode: 'register',
        platform
    });
    const result = await verifyPlatformChallenge(event, pending, body.credential);
    const taken = await prisma.linkedAccount.findUnique({
        where: { platform_platformUid: { platform, platformUid: result.platformUid } },
        select: { id: true }
    });
    if (taken)
        throw createError({ statusCode: 409, message: 'This platform account is already linked' });
    const avatarUrl =
        platform === 'luogu'
            ? `https://cdn.luogu.com.cn/upload/usericon/${encodeURIComponent(result.platformUid)}.png`
            : result.avatarUrl || null;
    await consumePlatformChallenge(event, pending);
    const user = await createUserWithLinkedIdentity(platform, {
        platformUid: result.platformUid,
        platformUsername: result.platformUsername || result.platformUid,
        displayName: result.platformUsername || null,
        avatarUrl,
        email: null,
        emailVerified: false
    });
    return completePrimaryAuthentication(event, user.id, {
        mode: 'register',
        redirect: pending.state.redirect,
        authVersion: user.authVersion
    });
}
