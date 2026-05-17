import { consola } from 'consola';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '~/server/utils/prisma';
import { getConfig } from '~/server/utils/config';
import { sendTwoFactorEmailCode } from '~/server/utils/mailer';
import { signAuthToken } from '~/server/utils/auth';
import { createAuthUserResponse } from '~/server/utils/user-response';
import {
    build2faLoginChallengeKey,
    generateSixDigitCode,
    hashCode,
    setRedisJson
} from '~/server/utils/security';

const logger = consola.withTag('auth:login');

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const { email, password, turnstileToken } = body;

    if (!email || !password) {
        throw createError({ statusCode: 400, message: 'Email and password are required' });
    }

    // Turnstile verification
    const turnstileEnabled = await getConfig('turnstile_enabled');
    if (turnstileEnabled === 'true') {
        const secret = await getConfig('turnstile_secret_key');
        if (!turnstileToken) {
            logger.warn(`Login rejected: captcha required but not provided for ${email}`);
            throw createError({ statusCode: 400, message: 'Captcha verification required' });
        }
        const res = await $fetch<{ success: boolean }>(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            { method: 'POST', body: { secret, response: turnstileToken } }
        );
        if (!res.success) {
            logger.warn(`Login rejected: captcha verification failed for ${email}`);
            throw createError({ statusCode: 400, message: 'Captcha verification failed' });
        }
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        logger.warn(`Login failed: unknown email ${email}`);
        throw createError({ statusCode: 401, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
        logger.warn(`Login failed: wrong password for ${email} (user=${user.id})`);
        throw createError({ statusCode: 401, message: 'Invalid credentials' });
    }

    if (user.twoFactorEnabled && user.twoFactorMethod) {
        const challengeId = crypto.randomUUID();

        if (user.twoFactorMethod === 'email_otp') {
            const code = generateSixDigitCode();
            const sent = await sendTwoFactorEmailCode(user.email, code);
            if (!sent) {
                throw createError({ statusCode: 503, message: 'SMTP is not configured' });
            }
            await setRedisJson(
                build2faLoginChallengeKey(challengeId),
                {
                    userId: user.id,
                    method: 'email_otp',
                    emailCodeHash: await hashCode(code)
                },
                600
            );
        } else {
            await setRedisJson(
                build2faLoginChallengeKey(challengeId),
                {
                    userId: user.id,
                    method: 'totp'
                },
                600
            );
        }

        return {
            requiresTwoFactor: true,
            method: user.twoFactorMethod,
            challengeId
        };
    }

    const token = await signAuthToken(user.id);

    logger.success(`Login successful: ${user.username} (${user.id})`);

    return { token, user: createAuthUserResponse(user) };
});
