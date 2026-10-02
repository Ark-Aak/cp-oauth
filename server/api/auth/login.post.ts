import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { emailSchema } from '~/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { parseBody } from '~/server/utils/validation';
import { verifyTurnstileToken } from '~/server/utils/turnstile';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { completePrimaryAuthentication } from '~/server/utils/auth-completion';

const loginSchema = z
    .object({
        email: emailSchema,
        password: z.string().min(1),
        turnstileToken: z.string().max(4096).optional(),
        redirect: z.string().max(4096).optional()
    })
    .strict();

export default defineEventHandler(async event => {
    const body = await parseBody(event, loginSchema);
    await enforceRateLimit(event, 'login', body.email);
    await verifyTurnstileToken({ token: body.turnstileToken, action: 'login' });
    const user = await prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true, passwordHash: true, authVersion: true }
    });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
        throw createError({
            statusCode: 401,
            message: 'Invalid credentials',
            data: { code: 'INVALID_CREDENTIALS' }
        });
    }
    return completePrimaryAuthentication(event, user.id, {
        redirect: getSafeRedirectTarget(body.redirect),
        mode: 'login',
        authVersion: user.authVersion
    });
});
