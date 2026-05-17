import { consola } from 'consola';
import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { generateCode, isSafeOAuthRedirectUri, validateScopes } from '~/server/utils/oauth';

const logger = consola.withTag('oauth:authorize');

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const body = await readBody(event);

    const {
        client_id: clientId,
        redirect_uri: redirectUri,
        scopes,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        approved
    } = body;

    if (!clientId || !redirectUri || !scopes || !Array.isArray(scopes)) {
        throw createError({ statusCode: 400, message: 'Missing required parameters' });
    }

    if (!validateScopes(scopes)) {
        logger.warn(`Invalid scopes [${scopes.join(', ')}] from user ${userId}`);
        throw createError({ statusCode: 400, message: 'Invalid scope(s)' });
    }

    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
        logger.warn(`Unknown client_id=${clientId} during consent from user ${userId}`);
        throw createError({ statusCode: 404, message: 'Unknown client' });
    }

    if (!isSafeOAuthRedirectUri(redirectUri) || !client.redirectUris.includes(redirectUri)) {
        logger.warn(`Invalid redirect_uri for client "${client.name}" from user ${userId}`);
        throw createError({ statusCode: 400, message: 'Invalid redirect_uri' });
    }

    if (!approved) {
        logger.info(`User ${userId} denied authorization for client_id=${clientId}`);
        return { redirect: `${redirectUri}?error=access_denied${state ? `&state=${state}` : ''}` };
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.oAuthAuthorizationCode.create({
        data: {
            code,
            clientId,
            userId,
            scopes,
            redirectUri,
            codeChallenge: codeChallenge || null,
            codeChallengeMethod: codeChallengeMethod || null,
            expiresAt
        }
    });

    const params = new URLSearchParams({ code });
    if (state) params.set('state', state);

    logger.success(
        `Authorization code issued for user ${userId} → client "${client.name}" (${clientId}), scopes=[${scopes.join(', ')}]`
    );

    return { redirect: `${redirectUri}?${params.toString()}` };
});
