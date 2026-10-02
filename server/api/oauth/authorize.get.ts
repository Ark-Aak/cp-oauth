import { consola } from 'consola';
import { handleOAuthRequest } from '~/server/utils/oauth';
import {
    readOAuthAuthorizationQuery,
    validateOAuthAuthorization
} from '~/server/utils/oauth-request';
import { incrementOAuthLoginRequestCount } from '~/server/utils/stats';

const logger = consola.withTag('oauth:authorize');

export default defineEventHandler(event =>
    handleOAuthRequest(
        event,
        async () => {
            const request = readOAuthAuthorizationQuery(event);
            const client = await validateOAuthAuthorization(request);
            try {
                await incrementOAuthLoginRequestCount();
            } catch {
                logger.warn('Authorization request counter unavailable');
            }
            return {
                client: {
                    name: client.name,
                    clientId: client.clientId,
                    requireEmailVerified: client.requireEmailVerified
                },
                scopes: request.scopes,
                redirectUri: request.redirectUri,
                state: request.state ?? null,
                codeChallenge: request.codeChallenge ?? null,
                codeChallengeMethod: request.codeChallengeMethod ?? null
            };
        },
        'invalid_request'
    )
);
