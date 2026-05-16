import crypto from 'crypto';
import { getUserIdFromEvent } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';
import { sendVerificationEmail } from '~/server/utils/mailer';
import { isOAuthGeneratedLocalEmail } from '~/server/utils/email';
import { getPublicBaseUrl } from '~/server/utils/base-url';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            email: true,
            emailVerified: true
        }
    });

    if (!user) {
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    if (user.emailVerified) {
        return { success: true, alreadyVerified: true };
    }

    if (isOAuthGeneratedLocalEmail(user.email)) {
        throw createError({
            statusCode: 400,
            message:
                'OAuth-generated placeholder email cannot be verified. Please set a real email first.'
        });
    }

    const emailVerifyToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
        where: { id: userId },
        data: { emailVerifyToken }
    });

    const sent = await sendVerificationEmail(user.email, emailVerifyToken, getPublicBaseUrl());
    if (!sent) {
        throw createError({ statusCode: 503, message: 'SMTP is not configured' });
    }

    return { success: true, alreadyVerified: false };
});
