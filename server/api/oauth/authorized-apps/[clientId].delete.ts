import { consola } from 'consola';
import { getUserIdFromEvent } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';

const logger = consola.withTag('oauth:authorized-apps');

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const clientId = getRouterParam(event, 'clientId');

    if (!clientId) {
        throw createError({ statusCode: 400, message: 'Missing clientId parameter' });
    }

    // Delete all access tokens and revoke all refresh tokens for this user+client
    const [deletedAccess, revokedRefresh] = await Promise.all([
        prisma.oAuthAccessToken.deleteMany({
            where: { userId, clientId }
        }),
        prisma.oAuthRefreshToken.updateMany({
            where: { userId, clientId, revoked: false },
            data: { revoked: true }
        })
    ]);

    logger.info(
        `User ${userId} revoked app client_id=${clientId}: ${deletedAccess.count} access tokens deleted, ${revokedRefresh.count} refresh tokens revoked`
    );

    return {
        success: true,
        deletedAccessTokens: deletedAccess.count,
        revokedRefreshTokens: revokedRefresh.count
    };
});
