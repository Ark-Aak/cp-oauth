import prisma from '~/server/utils/prisma';

export default defineEventHandler(async () => {
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
        take: 50
    });
    return users;
});
