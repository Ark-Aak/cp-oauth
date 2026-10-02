import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';
import { httpUrlSchema } from '~/utils/validation';

interface PublicShowcaseItem {
    id: string;
    category: string;
    name: string;
    description: string;
    url: string | null;
    iconUrl: string | null;
}

function sanitizeUrls(item: PublicShowcaseItem): PublicShowcaseItem {
    return {
        ...item,
        url: httpUrlSchema.safeParse(item.url).success ? item.url : null,
        iconUrl: httpUrlSchema.safeParse(item.iconUrl).success ? item.iconUrl : null
    };
}

const CACHE_KEY = 'public:showcase';
const CACHE_TTL = 300; // 5 minutes

export default defineEventHandler(async () => {
    const redis = getRedis();

    try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) {
            const result = JSON.parse(cached) as {
                sites: PublicShowcaseItem[];
                projects: PublicShowcaseItem[];
            };
            return {
                sites: result.sites.map(sanitizeUrls),
                projects: result.projects.map(sanitizeUrls)
            };
        }
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
        sites: items.filter(i => i.category === 'site').map(sanitizeUrls),
        projects: items.filter(i => i.category === 'project').map(sanitizeUrls)
    };

    try {
        await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch {
        // Redis unavailable
    }

    return result;
});
