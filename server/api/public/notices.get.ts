import prisma from '~/server/utils/prisma';

export default defineEventHandler(async () => {
    const noticeClient = (prisma as any).notice;
    const notices = await noticeClient.findMany({
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
        take: 3,
        select: {
            id: true,
            title: true,
            content: true,
            pinned: true,
            publishedAt: true
        }
    });

    return notices;
});
