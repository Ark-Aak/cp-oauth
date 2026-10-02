import prisma from '~/server/utils/prisma';
import { getAuthContext } from '~/server/utils/auth';
import { hashToken } from '~/server/utils/token-hash';
import {
    generateCode,
    handleOAuthRequest,
    OAuthProtocolError,
    withOAuthGrantLock
} from '~/server/utils/oauth';
import {
    readOAuthAuthorizationConsent,
    validateOAuthAuthorization
} from '~/server/utils/oauth-request';

export default defineEventHandler(event =>
    handleOAuthRequest(
        event,
        async () => {
            const request = await readOAuthAuthorizationConsent(event);
            await validateOAuthAuthorization(request);
            const callback = new URL(request.redirectUri);
            if (request.state !== undefined) callback.searchParams.set('state', request.state);
            if (!request.approved) {
                callback.searchParams.set('error', 'access_denied');
                return { redirect: callback.toString() };
            }

            const auth = getAuthContext(event);
            const code = generateCode();
            await prisma.$transaction(async tx => {
                await withOAuthGrantLock(tx, auth.userId, request.clientId);
                const client = await tx.oAuthClient.findUnique({
                    where: { clientId: request.clientId }
                });
                if (!client || !client.redirectUris.includes(request.redirectUri)) {
                    throw new OAuthProtocolError(
                        'invalid_request',
                        'The OAuth client or redirect_uri is no longer valid'
                    );
                }
                const user = await tx.user.findUnique({
                    where: { id: auth.userId },
                    select: { authVersion: true, emailVerified: true }
                });
                if (!user || user.authVersion !== auth.authVersion) {
                    throw createError({ statusCode: 401, message: 'Please sign in again' });
                }
                if (client.requireEmailVerified && !user.emailVerified) {
                    throw createError({
                        statusCode: 403,
                        message: 'Email verification is required',
                        data: { reason: 'email_not_verified' }
                    });
                }
                await tx.oAuthAuthorizationCode.create({
                    data: {
                        codeHash: hashToken(code),
                        clientId: request.clientId,
                        userId: auth.userId,
                        scopes: request.scopes,
                        redirectUri: request.redirectUri,
                        codeChallengeHash:
                            request.codeChallenge === undefined
                                ? null
                                : hashToken(request.codeChallenge),
                        codeChallengeMethod: request.codeChallengeMethod ?? null,
                        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
                    }
                });
            });
            callback.searchParams.set('code', code);
            return { redirect: callback.toString() };
        },
        'invalid_request'
    )
);
