import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { setOAuthNoStore } from '~/server/utils/oauth';

export default defineEventHandler(async event => {
    setOAuthNoStore(event);
    const userId = getUserIdFromEvent(event);
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, message: 'Client ID required' });
    try {
        const deleted = await prisma.oAuthClient.deleteMany({ where: { id, userId } });
        if (deleted.count !== 1) {
            throw createError({
                statusCode: 404,
                message: 'Client not found',
                data: { code: 'CLIENT_NOT_FOUND' }
            });
        }
        return { success: true };
    } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === 'P2003' || code === 'P2025') {
            throw createError({
                statusCode: 404,
                message: 'Client not found',
                data: { code: 'CLIENT_NOT_FOUND' }
            });
        }
        throw error;
    }
});
