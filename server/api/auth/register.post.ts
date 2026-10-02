import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { getConfig, requireRegistrationEnabled } from '~/server/utils/config';
import { sendVerificationEmail } from '~/server/utils/mailer';
import { hashToken } from '~/server/utils/token-hash';
import { getPublicBaseUrl } from '~/server/utils/base-url';
import { getDataEncryptionKey } from '~/server/utils/data-encryption';
import { createUserWithInitialRole } from '~/server/utils/role';
import { emailSchema, usernameSchema, newPasswordSchema } from '~/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { parseBody } from '~/server/utils/validation';
import { verifyTurnstileToken } from '~/server/utils/turnstile';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { completePrimaryAuthentication } from '~/server/utils/auth-completion';

const registerSchema = z
    .object({
        username: usernameSchema,
        email: emailSchema,
        password: newPasswordSchema,
        turnstileToken: z.string().max(4096).optional(),
        redirect: z.string().max(4096).optional()
    })
    .strict();

export default defineEventHandler(async event => {
    const body = await parseBody(event, registerSchema);
    await enforceRateLimit(event, 'register');
    await requireRegistrationEnabled();
    await verifyTurnstileToken({ token: body.turnstileToken, action: 'register' });
    const redirect = getSafeRedirectTarget(body.redirect);
    const baseUrl = getPublicBaseUrl();
    getDataEncryptionKey();
    // Resolve required runtime/mail configuration before committing a new account.
    await getConfig([
        'site_title',
        'smtp_host',
        'smtp_port',
        'smtp_user',
        'smtp_pass',
        'smtp_from'
    ]);
    const [existingEmail, existingUsername] = await Promise.all([
        prisma.user.findUnique({ where: { email: body.email }, select: { id: true } }),
        prisma.user.findUnique({ where: { username: body.username }, select: { id: true } })
    ]);
    if (existingEmail || existingUsername) {
        throw createError({ statusCode: 409, message: 'User already exists' });
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const emailVerifyToken = randomBytes(32).toString('base64url');
    const user = await createUserWithInitialRole({
        data: {
            username: body.username,
            email: body.email,
            passwordHash,
            emailVerifyToken: hashToken(emailVerifyToken),
            emailVerifyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
    }).catch(error => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
            throw createError({ statusCode: 409, message: 'User already exists' });
        }
        throw error;
    });
    const verificationEmailSent = await sendVerificationEmail(
        body.email,
        emailVerifyToken,
        baseUrl,
        redirect
    );
    const result = await completePrimaryAuthentication(event, user.id, {
        redirect,
        mode: 'register',
        authVersion: user.authVersion
    });
    return 'authenticated' in result ? { ...result, verificationEmailSent } : result;
});
