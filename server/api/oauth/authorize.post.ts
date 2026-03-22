import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { generateCode, validateScopes } from '~/server/utils/oauth';

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

    if (!approved) {
        return { redirect: `${redirectUri}?error=access_denied${state ? `&state=${state}` : ''}` };
    }

    if (!clientId || !redirectUri || !scopes || !Array.isArray(scopes)) {
        throw createError({ statusCode: 400, message: 'Missing required parameters' });
    }

    if (!validateScopes(scopes)) {
        throw createError({ statusCode: 400, message: 'Invalid scope(s)' });
    }

    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
        throw createError({ statusCode: 404, message: 'Unknown client' });
    }

    if (!client.redirectUris.includes(redirectUri)) {
        throw createError({ statusCode: 400, message: 'Invalid redirect_uri' });
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

    return { redirect: `${redirectUri}?${params.toString()}` };
});
