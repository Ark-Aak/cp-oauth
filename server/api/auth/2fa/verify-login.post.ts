import prisma from '~/server/utils/prisma';
import { signAuthToken } from '~/server/utils/auth';
import { createAuthUserResponse } from '~/server/utils/user-response';
import {
    build2faLoginChallengeKey,
    consumeRedisJson,
    getRedisJson,
    verifyCodeHash,
    verifyTotp
} from '~/server/utils/security';

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const challengeId = String(body?.challengeId || '');
    const code = String(body?.code || '').trim();

    if (!challengeId || !code) {
        throw createError({ statusCode: 400, message: 'challengeId and code are required' });
    }

    const key = build2faLoginChallengeKey(challengeId);
    const payload = await getRedisJson<{
        userId: string;
        method: 'email_otp' | 'totp';
        emailCodeHash?: string;
    }>(key);

    if (!payload) {
        throw createError({ statusCode: 400, message: 'Challenge is invalid or expired' });
    }

    const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            totpSecret: true,
            twoFactorEnabled: true,
            twoFactorMethod: true
        }
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorMethod) {
        throw createError({ statusCode: 401, message: 'Two-factor verification is unavailable' });
    }

    if (payload.method === 'email_otp') {
        if (!payload.emailCodeHash) {
            throw createError({ statusCode: 400, message: 'Email verification code is missing' });
        }
        const valid = await verifyCodeHash(code, payload.emailCodeHash);
        if (!valid) {
            throw createError({ statusCode: 401, message: 'Invalid verification code' });
        }
    } else {
        if (!user.totpSecret || !(await verifyTotp(user.totpSecret, code))) {
            throw createError({ statusCode: 401, message: 'Invalid verification code' });
        }
    }

    const consumed = await consumeRedisJson(key);
    if (!consumed) {
        throw createError({ statusCode: 400, message: 'Challenge is invalid or expired' });
    }

    return {
        token: await signAuthToken(user.id),
        user: createAuthUserResponse(user)
    };
});
