import { consola } from 'consola';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '~/server/utils/prisma';
import { getConfig } from '~/server/utils/config';
import { sendVerificationEmail } from '~/server/utils/mailer';
import { USERNAME_RULE_MESSAGE, isValidUsername, normalizeUsername } from '~/utils/username';

const logger = consola.withTag('auth:register');

export default defineEventHandler(async event => {
    const regEnabled = await getConfig('registration_enabled');
    if (regEnabled === 'false') {
        logger.warn('Registration attempt rejected: registration disabled');
        throw createError({ statusCode: 403, message: 'Registration is currently disabled' });
    }

    const body = await readBody(event);
    const { username, email, password, turnstileToken } = body;
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || !email || !password) {
        throw createError({ statusCode: 400, message: 'All fields are required' });
    }

    if (!isValidUsername(normalizedUsername)) {
        throw createError({ statusCode: 400, message: USERNAME_RULE_MESSAGE });
    }

    // Turnstile verification
    const turnstileEnabled = await getConfig('turnstile_enabled');
    if (turnstileEnabled === 'true') {
        const secret = await getConfig('turnstile_secret_key');
        if (!turnstileToken) {
            logger.warn(`Registration rejected: captcha required but not provided for ${email}`);
            throw createError({ statusCode: 400, message: 'Captcha verification required' });
        }
        const res = await $fetch<{ success: boolean }>(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            { method: 'POST', body: { secret, response: turnstileToken } }
        );
        if (!res.success) {
            logger.warn(`Registration rejected: captcha verification failed for ${email}`);
            throw createError({ statusCode: 400, message: 'Captcha verification failed' });
        }
    }

    const existing = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { username: { equals: normalizedUsername, mode: 'insensitive' } }]
        }
    });

    if (existing) {
        logger.warn(
            `Registration rejected: user already exists (email=${email}, username=${normalizedUsername})`
        );
        throw createError({ statusCode: 409, message: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const emailVerifyToken = crypto.randomBytes(32).toString('hex');

    // First registered user becomes admin
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'admin' : 'user';

    const user = await prisma.user.create({
        data: { username: normalizedUsername, email, passwordHash, emailVerifyToken, role }
    });

    logger.success(`User registered: ${normalizedUsername} (${user.id}), role=${role}`);

    // Attempt to send verification email
    const host = getHeader(event, 'host') || 'localhost:3000';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    await sendVerificationEmail(email, emailVerifyToken, baseUrl);

    const config = useRuntimeConfig();
    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

    return { token, user: { id: user.id, username: user.username, email: user.email } };
});
