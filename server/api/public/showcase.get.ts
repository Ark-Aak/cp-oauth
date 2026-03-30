import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';

const CACHE_KEY = 'public:showcase';
const CACHE_TTL = 300; // 5 minutes

export default defineEventHandler(async () => {
    const redis = getRedis();

    try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) return JSON.parse(cached);
    } catch {
        // Redis unavailable
    }

    const items = await prisma.showcaseItem.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: {
            id: true,
            category: true,
            name: true,
            description: true,
            url: true,
            iconUrl: true
        }
    });

    const result = {
        sites: items.filter(i => i.category === 'site'),
        projects: items.filter(i => i.category === 'project')
    };

    try {
        await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch {
        // Redis unavailable
    }

    return result;
});
