import prisma from '~/server/utils/prisma';
import { hashToken } from '~/server/utils/token-hash';
import {
    authenticateOAuthClient,
    handleOAuthRequest,
    withOAuthGrantLock
} from '~/server/utils/oauth';
import { readOAuthTokenBody, requireOAuthParameter } from '~/server/utils/oauth-request';

export default defineEventHandler(event =>
    handleOAuthRequest(
        event,
        async () => {
            const body = await readOAuthTokenBody(event);
            const tokenHash = hashToken(requireOAuthParameter(body, 'token'));
            const clientId = requireOAuthParameter(body, 'client_id');
            const kinds =
                body.token_type_hint === 'access_token'
                    ? (['access_token', 'refresh_token'] as const)
                    : (['refresh_token', 'access_token'] as const);
            let candidate: {
                kind: 'access_token' | 'refresh_token';
                userId: string;
                clientAuthRequired: boolean;
            } | null = null;
            for (const kind of kinds) {
                const token =
                    kind === 'refresh_token'
                        ? await prisma.oAuthRefreshToken.findFirst({
                              where: { tokenHash, clientId },
                              select: { userId: true, clientAuthRequired: true }
                          })
                        : await prisma.oAuthAccessToken.findFirst({
                              where: { tokenHash, clientId },
                              select: { userId: true, clientAuthRequired: true }
                          });
                if (token) {
                    candidate = { ...token, kind };
                    break;
                }
            }
            // Unknown/foreign tokens reveal nothing; any explicitly submitted secret still must be valid.
            await authenticateOAuthClient(
                clientId,
                body.client_secret,
                candidate?.clientAuthRequired ?? false
            );
            if (candidate) {
                const grant = candidate;
                await prisma.$transaction(
                    async tx => {
                        await withOAuthGrantLock(tx, grant.userId, clientId);
                        if (grant.kind === 'refresh_token') {
                            const refreshed = await tx.oAuthRefreshToken.updateMany({
                                where: { tokenHash, userId: grant.userId, clientId },
                                data: { revoked: true }
                            });
                            if (refreshed.count) {
                                await tx.oAuthAccessToken.deleteMany({
                                    where: { userId: grant.userId, clientId }
                                });
                            }
                        } else {
                            await tx.oAuthAccessToken.deleteMany({
                                where: { tokenHash, userId: grant.userId, clientId }
                            });
                        }
                    },
                    { maxWait: 10000, timeout: 15000 }
                );
            }
            return { success: true };
        },
        'invalid_request'
    )
);
