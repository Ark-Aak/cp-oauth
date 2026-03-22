import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '~/server/utils/prisma';
import { verifyPKCE } from '~/server/utils/oauth';

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const {
        grant_type: grantType,
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier
    } = body;

    if (grantType !== 'authorization_code') {
        throw createError({
            statusCode: 400,
            message: 'Unsupported grant_type. Use "authorization_code".'
        });
    }

    if (!code || !redirectUri || !clientId) {
        throw createError({
            statusCode: 400,
            message: 'Missing required parameters: code, redirect_uri, client_id'
        });
    }

    const authCode = await prisma.oAuthAuthorizationCode.findUnique({ where: { code } });
    if (!authCode) {
        throw createError({ statusCode: 400, message: 'Invalid authorization code' });
    }

    if (authCode.used) {
        throw createError({ statusCode: 400, message: 'Authorization code already used' });
    }

    if (authCode.expiresAt < new Date()) {
        throw createError({ statusCode: 400, message: 'Authorization code expired' });
    }

    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
        throw createError({ statusCode: 400, message: 'Parameter mismatch' });
    }

    // PKCE or client_secret verification
    if (authCode.codeChallenge) {
        if (!codeVerifier) {
            throw createError({ statusCode: 400, message: 'code_verifier required for PKCE' });
        }
        if (!verifyPKCE(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
            throw createError({ statusCode: 400, message: 'Invalid code_verifier' });
        }
    } else {
        if (!clientSecret) {
            throw createError({ statusCode: 400, message: 'client_secret required' });
        }
        const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
        if (!client) {
            throw createError({ statusCode: 400, message: 'Unknown client' });
        }
        const valid = await bcrypt.compare(clientSecret, client.clientSecretHash);
        if (!valid) {
            throw createError({ statusCode: 401, message: 'Invalid client_secret' });
        }
    }

    // Mark code as used
    await prisma.oAuthAuthorizationCode.update({
        where: { code },
        data: { used: true }
    });

    // Create access token as JWT
    const config = useRuntimeConfig();
    const expiresIn = 3600; // 1 hour
    const accessToken = jwt.sign(
        {
            sub: authCode.userId,
            client_id: authCode.clientId,
            scopes: authCode.scopes,
            type: 'oauth_access'
        },
        config.jwtSecret,
        { expiresIn }
    );

    // Persist token record
    await prisma.oAuthAccessToken.create({
        data: {
            token: accessToken,
            clientId: authCode.clientId,
            userId: authCode.userId,
            scopes: authCode.scopes,
            expiresAt: new Date(Date.now() + expiresIn * 1000)
        }
    });

    return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: authCode.scopes.join(' ')
    };
});
