import prisma from '~/server/utils/prisma';
import { requireAdmin } from '~/server/utils/admin';
import { getRedis } from '~/server/utils/redis';

export default defineEventHandler(async event => {
    await requireAdmin(event);

    const id = getRouterParam(event, 'id');
    if (!id) {
        throw createError({ statusCode: 400, message: 'Missing showcase item ID' });
    }

    await prisma.showcaseItem.delete({ where: { id } });

    // Invalidate public cache
    try {
        await getRedis().del('public:showcase');
    } catch {
        // Redis unavailable
    }

    return { success: true };
});
