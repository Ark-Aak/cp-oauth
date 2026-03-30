import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';

const CACHE_TTL = 120; // 2 minutes

export default defineEventHandler(async event => {
    const query = getQuery<{ limit?: string }>(event);
    const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : 50;
    const take = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 50;

    const redis = getRedis();
    const cacheKey = `public:users:list:${take}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
    } catch {
        // Redis unavailable
    }

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

    try {
        await redis.set(cacheKey, JSON.stringify(users), 'EX', CACHE_TTL);
    } catch {
        // Redis unavailable
    }

    return users;
});
