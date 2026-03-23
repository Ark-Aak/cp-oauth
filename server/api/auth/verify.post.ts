import crypto from 'crypto';
import { getUserIdFromEvent } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';
import { sendVerificationEmail } from '~/server/utils/mailer';

function getBaseUrl(event: Parameters<typeof getRequestURL>[0]): string {
    const host = getHeader(event, 'host') || 'localhost:3000';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
}

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

    const emailVerifyToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
        where: { id: userId },
        data: { emailVerifyToken }
    });

    const sent = await sendVerificationEmail(user.email, emailVerifyToken, getBaseUrl(event));
    if (!sent) {
        throw createError({ statusCode: 503, message: 'SMTP is not configured' });
    }

    return { success: true, alreadyVerified: false };
});
