import prisma from '~/server/utils/prisma';

export default defineEventHandler(async event => {
    const query = getQuery<{ limit?: string }>(event);
    const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : 50;
    const take = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 50;

    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            displayName: true,
            bio: true,
            avatarUrl: true,
            createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take
    });
    return users;
});
