import prisma from '~/server/utils/prisma';
import { requireAdmin } from '~/server/utils/admin';

export default defineEventHandler(async event => {
    await requireAdmin(event);
    const noticeClient = prisma.notice;
    const id = getRouterParam(event, 'id');

    if (!id) {
        throw createError({ statusCode: 400, message: 'Notice ID required' });
    }

    await noticeClient.delete({ where: { id } });
    return { success: true };
});
