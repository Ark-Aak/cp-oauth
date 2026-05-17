import { consola } from 'consola';
import prisma from '~/server/utils/prisma';
import { isSafeOAuthRedirectUri, validateScopes } from '~/server/utils/oauth';

const logger = consola.withTag('oauth:authorize');

export default defineEventHandler(async event => {
    const query = getQuery(event);
    const clientId = query.client_id as string;
    const redirectUri = query.redirect_uri as string;
    const responseType = query.response_type as string;
    const scope = query.scope as string;
    const state = query.state as string | undefined;
    const codeChallenge = query.code_challenge as string | undefined;
    const codeChallengeMethod = query.code_challenge_method as string | undefined;

    logger.info(
        `Authorization request: client_id=${clientId}, scopes=${scope}, pkce=${!!codeChallenge}`
    );

    if (responseType !== 'code') {
        logger.warn(
            `Rejected: unsupported response_type="${responseType}" from client_id=${clientId}`
        );
        throw createError({ statusCode: 400, message: 'Unsupported response_type. Use "code".' });
    }

    if (!clientId || !redirectUri || !scope) {
        logger.warn('Rejected: missing required parameters');
        throw createError({
            statusCode: 400,
            message: 'Missing required parameters: client_id, redirect_uri, scope'
        });
    }

    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
        logger.warn(`Rejected: unknown client_id=${clientId}`);
        throw createError({ statusCode: 404, message: 'Unknown client_id' });
    }

    if (!isSafeOAuthRedirectUri(redirectUri) || !client.redirectUris.includes(redirectUri)) {
        logger.warn(`Rejected: invalid redirect_uri for client "${client.name}" (${clientId})`);
        throw createError({ statusCode: 400, message: 'Invalid redirect_uri' });
    }

    const scopes = scope.split(' ').filter(Boolean);
    if (!validateScopes(scopes)) {
        logger.warn(`Rejected: invalid scopes [${scopes.join(', ')}] for client "${client.name}"`);
        throw createError({ statusCode: 400, message: 'Invalid scope(s) requested' });
    }

    logger.info(
        `Authorization page served for client "${client.name}" (${clientId}), scopes=[${scopes.join(', ')}]`
    );

    return {
        client: { name: client.name, clientId: client.clientId },
        scopes,
        redirectUri,
        state: state || null,
        codeChallenge: codeChallenge || null,
        codeChallengeMethod: codeChallengeMethod || null
    };
});
