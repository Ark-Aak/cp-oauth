import { consola } from 'consola';
import prisma from '~/server/utils/prisma';
import { isOAuthGeneratedLocalEmail } from '~/server/utils/email';
import { hashToken } from '~/server/utils/token-hash';

const logger = consola.withTag('auth:verify');

export default defineEventHandler(async event => {
    const query = getQuery(event);
    const token = query.token as string;

    if (!token) {
        return sendRedirect(event, '/email-verified?status=error');
    }

    const user = await prisma.user.findUnique({ where: { emailVerifyToken: hashToken(token) } });
    if (!user) {
        logger.warn('Email verification failed: invalid or expired token');
        return sendRedirect(event, '/email-verified?status=error');
    }

    if (isOAuthGeneratedLocalEmail(user.email)) {
        await prisma.user.update({
            where: { id: user.id },
            data: { emailVerifyToken: null }
        });
        logger.warn(
            `Email verification blocked for placeholder email: ${user.username} (${user.id})`
        );
        return sendRedirect(event, '/email-verified?status=error');
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifyToken: null }
    });

    logger.success(`Email verified: ${user.username} (${user.id})`);

    return sendRedirect(event, '/email-verified?status=success');
});
