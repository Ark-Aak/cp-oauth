import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { setOAuthNoStore } from '~/server/utils/oauth';
import { oauthClientPatchSchema } from '~/server/utils/oauth-request';
import { parseBody } from '~/server/utils/validation';

export default defineEventHandler(async event => {
    setOAuthNoStore(event);
    const userId = getUserIdFromEvent(event);
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, message: 'Client ID required' });
    const data = await parseBody(event, oauthClientPatchSchema);
    try {
        return await prisma.$transaction(async tx => {
            const updated = await tx.oAuthClient.updateMany({ where: { id, userId }, data });
            if (updated.count !== 1) {
                throw createError({
                    statusCode: 404,
                    message: 'Client not found',
                    data: { code: 'CLIENT_NOT_FOUND' }
                });
            }
            return tx.oAuthClient.findUniqueOrThrow({
                where: { id },
                select: {
                    id: true,
                    clientId: true,
                    name: true,
                    redirectUris: true,
                    requireEmailVerified: true,
                    createdAt: true
                }
            });
        });
    } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === 'P2002') {
            throw createError({
                statusCode: 409,
                message: 'Client update conflict',
                data: { code: 'CLIENT_CONFLICT' }
            });
        }
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
