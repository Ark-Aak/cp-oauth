import { consola } from 'consola';
import prisma from '~/server/utils/prisma';

const logger = consola.withTag('auth:verify');

export default defineEventHandler(async event => {
    const query = getQuery(event);
    const token = query.token as string;

    if (!token) {
        return sendRedirect(event, '/email-verified?status=error');
    }

    const user = await prisma.user.findUnique({ where: { emailVerifyToken: token } });
    if (!user) {
        logger.warn('Email verification failed: invalid or expired token');
        return sendRedirect(event, '/email-verified?status=error');
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifyToken: null }
    });

    logger.success(`Email verified: ${user.username} (${user.id})`);

    return sendRedirect(event, '/email-verified?status=success');
});
