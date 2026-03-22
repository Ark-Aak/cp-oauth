import prisma from '~/server/utils/prisma';

export default defineEventHandler(async event => {
    const query = getQuery(event);
    const token = query.token as string;

    if (!token) {
        throw createError({ statusCode: 400, message: 'Verification token required' });
    }

    const user = await prisma.user.findUnique({ where: { emailVerifyToken: token } });
    if (!user) {
        throw createError({ statusCode: 400, message: 'Invalid or expired verification token' });
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifyToken: null }
    });

    return sendRedirect(event, '/login?verified=true');
});
