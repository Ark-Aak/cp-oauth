import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';

const CACHE_KEY = 'public:notices';
const CACHE_TTL = 60; // 1 minute

export default defineEventHandler(async () => {
    const redis = getRedis();

    try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) return JSON.parse(cached);
    } catch {
        // Redis unavailable
    }

    const noticeClient = prisma.notice;
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

    try {
        await redis.set(CACHE_KEY, JSON.stringify(notices), 'EX', CACHE_TTL);
    } catch {
        // Redis unavailable
    }

    return notices;
});
