import crypto from 'node:crypto';
import { z } from 'zod';
import { createError, defineEventHandler } from 'h3';
import { assertAuthState, getAuthContext, lockAuthUser } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';
import { sendVerificationEmail } from '~/server/utils/mailer';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { hashToken } from '~/server/utils/token-hash';
import { isOAuthGeneratedLocalEmail } from '~/server/utils/email';
import { getPublicBaseUrl } from '~/server/utils/base-url';
import { parseBody } from '~/server/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

const verificationRequestSchema = z
    .strictObject({
        redirect: z.string().max(4096).optional()
    })
    .optional()
    .default({});

export default defineEventHandler(async event => {
    const state = getAuthContext(event);
    const body = await parseBody(event, verificationRequestSchema);
    const redirect = getSafeRedirectTarget(body.redirect);
    const baseUrl = getPublicBaseUrl();
    const token = crypto.randomBytes(32).toString('hex');

    const delivery = await prisma.$transaction(async tx => {
        await lockAuthUser(tx, state.userId);
        await assertAuthState(event, state);
        const user = await tx.user.findUnique({
            where: { id: state.userId },
            select: { email: true, emailVerified: true, pendingEmail: true }
        });
        if (!user) throw createError({ statusCode: 404, message: 'User not found' });
        if (!user.pendingEmail && user.emailVerified) {
            return { alreadyVerified: true as const };
        }

        const to = user.pendingEmail ?? user.email;
        if (isOAuthGeneratedLocalEmail(to)) {
            throw createError({
                statusCode: 400,
                message: 'Set a real email address before requesting verification'
            });
        }
        await enforceRateLimit(event, 'email', to);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await tx.user.update({
            where: { id: state.userId },
            data: user.pendingEmail
                ? { pendingEmailTokenHash: hashToken(token), pendingEmailExpiresAt: expiresAt }
                : { emailVerifyToken: hashToken(token), emailVerifyExpiresAt: expiresAt }
        });
        return { alreadyVerified: false as const, to, pendingEmail: !!user.pendingEmail };
    });

    if (delivery.alreadyVerified) {
        return {
            success: true,
            alreadyVerified: true,
            verificationEmailSent: true,
            pendingEmail: false
        };
    }

    const verificationEmailSent = await sendVerificationEmail(
        delivery.to,
        token,
        baseUrl,
        redirect
    );
    return {
        success: true,
        alreadyVerified: false,
        verificationEmailSent,
        pendingEmail: delivery.pendingEmail
    };
});
