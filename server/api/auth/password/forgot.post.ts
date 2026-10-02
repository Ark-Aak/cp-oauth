import crypto from 'node:crypto';
import { z } from 'zod';
import { defineEventHandler } from 'h3';
import prisma from '~/server/utils/prisma';
import { lockAuthUser } from '~/server/utils/auth';
import { sendPasswordResetEmail } from '~/server/utils/mailer';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { hashToken } from '~/server/utils/token-hash';
import { isOAuthGeneratedLocalEmail } from '~/server/utils/email';
import { getPublicBaseUrl } from '~/server/utils/base-url';
import { parseBody } from '~/server/utils/validation';
import { emailSchema } from '~/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

const passwordForgotSchema = z.strictObject({
    email: emailSchema,
    redirect: z.string().max(4096).optional()
});

export default defineEventHandler(async event => {
    const body = await parseBody(event, passwordForgotSchema);
    await enforceRateLimit(event, 'email', body.email);
    const baseUrl = getPublicBaseUrl();
    const redirect = getSafeRedirectTarget(body.redirect);
    const user = await prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true, email: true }
    });
    if (!user || isOAuthGeneratedLocalEmail(user.email)) return { success: true };

    const token = crypto.randomBytes(32).toString('hex');
    const issued = await prisma.$transaction(async tx => {
        await lockAuthUser(tx, user.id);
        const updated = await tx.user.updateMany({
            where: { id: user.id, email: user.email },
            data: {
                passwordResetToken: hashToken(token),
                passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
            }
        });
        return updated.count === 1;
    });
    if (issued) await sendPasswordResetEmail(user.email, token, baseUrl, redirect);

    return { success: true };
});
