import { getAuthContext } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';
import { handleOAuthRequest, withOAuthGrantLock } from '~/server/utils/oauth';

export default defineEventHandler(event =>
    handleOAuthRequest(
        event,
        async () => {
            const auth = getAuthContext(event);
            const clientId = getRouterParam(event, 'clientId');
            if (!clientId)
                throw createError({ statusCode: 400, message: 'Missing clientId parameter' });

            return prisma.$transaction(
                async tx => {
                    await withOAuthGrantLock(tx, auth.userId, clientId);
                    const user = await tx.user.findUnique({
                        where: { id: auth.userId },
                        select: { authVersion: true }
                    });
                    if (!user || user.authVersion !== auth.authVersion) {
                        throw createError({ statusCode: 401, message: 'Please sign in again' });
                    }
                    const client = await tx.oAuthClient.findUnique({
                        where: { clientId },
                        select: { id: true }
                    });
                    if (!client)
                        throw createError({ statusCode: 404, message: 'Client not found' });
                    const deletedAccess = await tx.oAuthAccessToken.deleteMany({
                        where: { userId: auth.userId, clientId }
                    });
                    const deletedRefresh = await tx.oAuthRefreshToken.deleteMany({
                        where: { userId: auth.userId, clientId }
                    });
                    const deletedCodes = await tx.oAuthAuthorizationCode.deleteMany({
                        where: { userId: auth.userId, clientId, used: false }
                    });
                    return {
                        success: true,
                        deletedAccessTokens: deletedAccess.count,
                        revokedRefreshTokens: deletedRefresh.count,
                        deletedAuthorizationCodes: deletedCodes.count
                    };
                },
                { maxWait: 10000, timeout: 15000 }
            );
        },
        'invalid_request'
    )
);
