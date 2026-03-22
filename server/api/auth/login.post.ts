import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '~/server/utils/prisma';
import { getConfig } from '~/server/utils/config';

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
            throw createError({ statusCode: 400, message: 'Captcha verification required' });
        }
        const res = await $fetch<{ success: boolean }>(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            { method: 'POST', body: { secret, response: turnstileToken } }
        );
        if (!res.success) {
            throw createError({ statusCode: 400, message: 'Captcha verification failed' });
        }
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        throw createError({ statusCode: 401, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
        throw createError({ statusCode: 401, message: 'Invalid credentials' });
    }

    const config = useRuntimeConfig();
    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

    return { token, user: { id: user.id, username: user.username, email: user.email } };
});
