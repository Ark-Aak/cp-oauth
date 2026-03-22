import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const id = getRouterParam(event, 'id');

    if (!id) {
        throw createError({ statusCode: 400, message: 'Client ID required' });
    }

    const client = await prisma.oAuthClient.findUnique({ where: { id } });
    if (!client || client.userId !== userId) {
        throw createError({ statusCode: 404, message: 'Client not found' });
    }

    await prisma.oAuthClient.delete({ where: { id } });

    return { success: true };
});
