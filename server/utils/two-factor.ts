import QRCode from 'qrcode';
import { createError, type H3Event } from 'h3';
import { z } from 'zod';
import type { TwoFactorMethod } from '~/types/auth';
import prisma from '~/server/utils/prisma';
import {
    assertAuthState,
    finishSensitiveMutation,
    getAuthContext,
    lockAuthUser
} from '~/server/utils/auth';
import { requireFreshReauthentication } from '~/server/utils/auth-completion';
import { getDataEncryptionKey } from '~/server/utils/data-encryption';
import { encryptSecret, decryptSecret } from '~/server/utils/secrets';
import { getRedis } from '~/server/utils/redis';
import { sendTwoFactorEmailCode } from '~/server/utils/mailer';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import {
    authChallengeExpired,
    build2faSetupEmailKey,
    build2faSetupTotpKey,
    buildTotpOtpauthUrl,
    consumeChallengeAttempt,
    deleteRedisKeyIfValue,
    generateSixDigitCode,
    generateTotpSecret,
    getRedisJsonWithRaw,
    hashCode,
    securityRedis,
    verifyCodeHash,
    verifyTotp
} from '~/server/utils/security';

const setupSchema = z
    .object({
        auth: z
            .object({
                userId: z.string(),
                sessionId: z.string(),
                authVersion: z.number().int(),
                role: z.string()
            })
            .strict(),
        purpose: z.literal('mfa_change'),
        method: z.enum(['email_otp', 'totp']),
        codeHash: z.string().optional(),
        secret: z.string().optional()
    })
    .strict();

export async function beginTwoFactorSetup(event: H3Event, method: TwoFactorMethod, token: string) {
    const auth = await requireFreshReauthentication(event, 'mfa_change', token);
    await enforceRateLimit(event, 'challenge', auth.userId);
    await assertAuthState(event, auth);
    const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { email: true, emailVerified: true }
    });
    if (!user) throw createError({ statusCode: 401, message: 'Authentication required' });
    if (method === 'email_otp' && !user.emailVerified) {
        throw createError({
            statusCode: 400,
            message: 'Verify your current email before enabling email authentication'
        });
    }
    let secret: string | undefined;
    let codeHash: string | undefined;
    let qrCodeDataUrl: string | undefined;
    if (method === 'email_otp') {
        await enforceRateLimit(event, 'email', user.email);
        const code = generateSixDigitCode();
        codeHash = await hashCode(code);
        if (!(await sendTwoFactorEmailCode(user.email, code))) {
            throw createError({ statusCode: 503, message: 'Unable to send authentication email' });
        }
    } else {
        const seed = generateTotpSecret();
        secret = encryptSecret(
            seed,
            `PendingTotp:${auth.userId}:${auth.sessionId}`,
            getDataEncryptionKey()
        );
        qrCodeDataUrl = await QRCode.toDataURL(buildTotpOtpauthUrl(user.email, seed));
    }
    const emailKey = build2faSetupEmailKey(auth.userId, auth.sessionId);
    const totpKey = build2faSetupTotpKey(auth.userId, auth.sessionId);
    const key = method === 'email_otp' ? emailKey : totpKey;
    const otherKey = method === 'email_otp' ? totpKey : emailKey;
    await securityRedis(() =>
        getRedis().eval(
            "redis.call('SET', KEYS[1], ARGV[1], 'EX', 600); redis.call('DEL', KEYS[2], KEYS[3], KEYS[4]); return 1",
            4,
            key,
            otherKey,
            `${key}:attempts`,
            `${otherKey}:attempts`,
            JSON.stringify({ auth, purpose: 'mfa_change', method, codeHash, secret })
        )
    );
    return method === 'totp' ? { qrCodeDataUrl: qrCodeDataUrl! } : { success: true };
}

export async function confirmTwoFactorSetup(event: H3Event, method: TwoFactorMethod, code: string) {
    const auth = getAuthContext(event);
    const key =
        method === 'email_otp'
            ? build2faSetupEmailKey(auth.userId, auth.sessionId)
            : build2faSetupTotpKey(auth.userId, auth.sessionId);
    await enforceRateLimit(event, 'mfa');
    const entry = await getRedisJsonWithRaw<unknown>(key);
    if (!entry) authChallengeExpired();
    const parsed = setupSchema.safeParse(entry.value);
    if (!parsed.success || parsed.data.method !== method) authChallengeExpired();
    const pending = parsed.data;
    await assertAuthState(event, pending.auth);
    await consumeChallengeAttempt(event, key);
    let secret: string | null = null;
    let valid = false;
    if (method === 'email_otp') {
        valid = !!pending.codeHash && (await verifyCodeHash(code, pending.codeHash));
    } else if (pending.secret) {
        try {
            secret = decryptSecret(
                pending.secret,
                `PendingTotp:${auth.userId}:${auth.sessionId}`,
                getDataEncryptionKey()
            );
        } catch {
            throw createError({
                statusCode: 503,
                message: 'Authenticator data is temporarily unavailable'
            });
        }
        valid = await verifyTotp(secret, code);
    }
    if (!valid) {
        throw createError({
            statusCode: 401,
            message: 'Invalid verification code',
            data: { code: 'INVALID_MFA_CODE' }
        });
    }
    const encryptedSecret = secret
        ? encryptSecret(secret, `User:totpSecret:${auth.userId}`, getDataEncryptionKey())
        : null;
    const authVersion = await prisma.$transaction(async tx => {
        await lockAuthUser(tx, auth.userId);
        await assertAuthState(event, pending.auth);
        const current = await tx.user.findUnique({
            where: { id: auth.userId },
            select: { emailVerified: true }
        });
        if (!current || (method === 'email_otp' && !current.emailVerified)) {
            throw createError({
                statusCode: 400,
                message: 'A verified email is required for email authentication'
            });
        }
        if (!(await deleteRedisKeyIfValue(key, entry.raw))) authChallengeExpired();
        const user = await tx.user.update({
            where: { id: auth.userId, authVersion: pending.auth.authVersion },
            data: {
                twoFactorEnabled: true,
                twoFactorMethod: method,
                totpSecret: encryptedSecret,
                authVersion: { increment: 1 }
            },
            select: { authVersion: true }
        });
        return user.authVersion;
    });
    await finishSensitiveMutation(event, auth.userId, authVersion);
    return { success: true };
}

export async function cancelTwoFactorSetup(event: H3Event): Promise<void> {
    const auth = getAuthContext(event);
    const emailKey = build2faSetupEmailKey(auth.userId, auth.sessionId);
    const totpKey = build2faSetupTotpKey(auth.userId, auth.sessionId);
    await securityRedis(() =>
        getRedis().del(emailKey, totpKey, `${emailKey}:attempts`, `${totpKey}:attempts`)
    );
}
