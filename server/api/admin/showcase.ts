import prisma from '~/server/utils/prisma';
import { requireAdmin } from '~/server/utils/admin';
import { getRedis } from '~/server/utils/redis';

interface CreateShowcaseBody {
    category?: string;
    name?: string;
    description?: string;
    url?: string;
    iconUrl?: string;
    sortOrder?: number;
}

const VALID_CATEGORIES = ['site', 'project'];

export default defineEventHandler(async event => {
    await requireAdmin(event);

    if (event.method === 'GET') {
        const items = await prisma.showcaseItem.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
        });
        return { items };
    }

    if (event.method === 'POST') {
        const body = await readBody<CreateShowcaseBody>(event);
        const category = body.category?.trim() || '';
        const name = body.name?.trim() || '';
        const description = body.description?.trim() || '';
        const url = body.url?.trim() || '';
        const iconUrl = body.iconUrl?.trim() || null;
        const sortOrder =
            typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
                ? body.sortOrder
                : 0;

        if (!VALID_CATEGORIES.includes(category)) {
            throw createError({
                statusCode: 400,
                message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`
            });
        }
        if (!name) {
            throw createError({ statusCode: 400, message: 'Name is required' });
        }
        if (!url) {
            throw createError({ statusCode: 400, message: 'URL is required' });
        }

        const item = await prisma.showcaseItem.create({
            data: { category, name, description, url, iconUrl, sortOrder }
        });

        // Invalidate public cache
        try {
            await getRedis().del('public:showcase');
        } catch {
            // Redis unavailable
        }

        return { item };
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
