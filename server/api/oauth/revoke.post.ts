import { consola } from 'consola';
import prisma from '~/server/utils/prisma';

const logger = consola.withTag('oauth:revoke');

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const { token, token_type_hint: tokenTypeHint } = body;

    if (!token) {
        throw createError({ statusCode: 400, message: 'Missing required parameter: token' });
    }

    // Try to find and revoke the token
    // Per RFC 7009, always return 200 regardless of whether the token was found

    if (tokenTypeHint === 'refresh_token' || !tokenTypeHint) {
        const refreshToken = await prisma.oAuthRefreshToken.findUnique({ where: { token } });
        if (refreshToken) {
            // Revoke the refresh token and delete all access tokens for this client+user
            await Promise.all([
                prisma.oAuthRefreshToken.update({
                    where: { id: refreshToken.id },
                    data: { revoked: true }
                }),
                prisma.oAuthAccessToken.deleteMany({
                    where: {
                        clientId: refreshToken.clientId,
                        userId: refreshToken.userId
                    }
                })
            ]);
            logger.info(
                `Revoked refresh_token and associated access tokens: user=${refreshToken.userId}, client_id=${refreshToken.clientId}`
            );
            return { success: true };
        }
    }

    if (tokenTypeHint === 'access_token' || !tokenTypeHint) {
        const accessToken = await prisma.oAuthAccessToken.findUnique({ where: { token } });
        if (accessToken) {
            await prisma.oAuthAccessToken.delete({ where: { id: accessToken.id } });
            logger.info(
                `Revoked access_token: user=${accessToken.userId}, client_id=${accessToken.clientId}`
            );
            return { success: true };
        }
    }

    // Token not found — still return 200 per RFC 7009
    logger.debug('Revoke request for unknown token — returning 200 per RFC 7009');
    return { success: true };
});
