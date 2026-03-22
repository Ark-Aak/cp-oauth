import prisma from '~/server/utils/prisma';
import { validateScopes } from '~/server/utils/oauth';

export default defineEventHandler(async event => {
    const query = getQuery(event);
    const clientId = query.client_id as string;
    const redirectUri = query.redirect_uri as string;
    const responseType = query.response_type as string;
    const scope = query.scope as string;
    const state = query.state as string | undefined;
    const codeChallenge = query.code_challenge as string | undefined;
    const codeChallengeMethod = query.code_challenge_method as string | undefined;

    if (responseType !== 'code') {
        throw createError({ statusCode: 400, message: 'Unsupported response_type. Use "code".' });
    }

    if (!clientId || !redirectUri || !scope) {
        throw createError({
            statusCode: 400,
            message: 'Missing required parameters: client_id, redirect_uri, scope'
        });
    }

    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
        throw createError({ statusCode: 404, message: 'Unknown client_id' });
    }

    if (!client.redirectUris.includes(redirectUri)) {
        throw createError({ statusCode: 400, message: 'Invalid redirect_uri' });
    }

    const scopes = scope.split(' ').filter(Boolean);
    if (!validateScopes(scopes)) {
        throw createError({ statusCode: 400, message: 'Invalid scope(s) requested' });
    }

    return {
        client: { name: client.name, clientId: client.clientId },
        scopes,
        redirectUri,
        state: state || null,
        codeChallenge: codeChallenge || null,
        codeChallengeMethod: codeChallengeMethod || null
    };
});
