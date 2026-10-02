import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { defineEventHandler, createError } from 'h3';
import prisma from '~/server/utils/prisma';
import { getAuthContext, assertAuthState } from '~/server/utils/auth';
import { completePrimaryAuthentication, reauthPurposeSchema } from '~/server/utils/auth-completion';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { parseBody } from '~/server/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

const schema = z
    .object({
        purpose: reauthPurposeSchema,
        method: z.literal('password'),
        password: z.string().min(1),
        redirect: z.string().max(4096).optional()
    })
    .strict();

export default defineEventHandler(async event => {
    const auth = getAuthContext(event);
    const body = await parseBody(event, schema);
    await enforceRateLimit(event, 'login', auth.userId);
    await assertAuthState(event, auth);
    const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { passwordHash: true, authVersion: true }
    });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
        throw createError({
            statusCode: 401,
            message: 'Password is incorrect',
            data: { code: 'INVALID_REAUTH_CREDENTIAL' }
        });
    }
    return completePrimaryAuthentication(event, auth.userId, {
        mode: 'reauth',
        purpose: body.purpose,
        sessionId: auth.sessionId,
        authVersion: user.authVersion,
        redirect: getSafeRedirectTarget(body.redirect)
    });
});
