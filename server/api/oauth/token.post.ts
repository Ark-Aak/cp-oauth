import { consola } from 'consola';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '~/server/utils/prisma';
import { verifyPKCE, generateRefreshToken } from '~/server/utils/oauth';

const logger = consola.withTag('oauth:token');

const ACCESS_TOKEN_EXPIRES_IN = 3600; // 1 hour
const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 3600; // 30 days

async function verifyClient(clientId: string, clientSecret: string | undefined) {
    if (!clientSecret) {
        logger.warn(`Rejected: missing client_secret for client_id=${clientId}`);
        throw createError({ statusCode: 400, message: 'client_secret required' });
    }
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
        logger.warn(`Rejected: unknown client_id=${clientId} during token exchange`);
        throw createError({ statusCode: 400, message: 'Unknown client' });
    }
    const valid = await bcrypt.compare(clientSecret, client.clientSecretHash);
    if (!valid) {
        logger.warn(`Rejected: invalid client_secret for "${client.name}" (${clientId})`);
        throw createError({ statusCode: 401, message: 'Invalid client_secret' });
    }
    logger.debug(`Client secret verified for "${client.name}" (${clientId})`);
}

function issueAccessToken(userId: string, clientId: string, scopes: string[]) {
    const config = useRuntimeConfig();
    const accessToken = jwt.sign(
        {
            sub: userId,
            client_id: clientId,
            scopes,
            type: 'oauth_access'
        },
        config.jwtSecret,
        { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
    );
    return accessToken;
}

async function handleAuthorizationCode(body: Record<string, string>) {
    const {
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier
    } = body;

    if (!code || !redirectUri || !clientId) {
        logger.warn('Rejected: missing required parameters in token request');
        throw createError({
            statusCode: 400,
            message: 'Missing required parameters: code, redirect_uri, client_id'
        });
    }

    const authCode = await prisma.oAuthAuthorizationCode.findUnique({ where: { code } });
    if (!authCode) {
        logger.warn(`Rejected: invalid authorization code from client_id=${clientId}`);
        throw createError({ statusCode: 400, message: 'Invalid authorization code' });
    }

    if (authCode.used) {
        logger.warn(
            `Rejected: code reuse attempt from client_id=${clientId}, user=${authCode.userId}`
        );
        throw createError({ statusCode: 400, message: 'Authorization code already used' });
    }

    if (authCode.expiresAt < new Date()) {
        logger.warn(`Rejected: expired code from client_id=${clientId}, user=${authCode.userId}`);
        throw createError({ statusCode: 400, message: 'Authorization code expired' });
    }

    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
        logger.warn(
            `Rejected: parameter mismatch for client_id=${clientId}, user=${authCode.userId}`
        );
        throw createError({ statusCode: 400, message: 'Parameter mismatch' });
    }

    // PKCE or client_secret verification
    if (authCode.codeChallenge) {
        if (!codeVerifier) {
            logger.warn(`Rejected: missing code_verifier for PKCE flow, client_id=${clientId}`);
            throw createError({ statusCode: 400, message: 'code_verifier required for PKCE' });
        }
        if (!verifyPKCE(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
            logger.warn(
                `Rejected: invalid code_verifier for client_id=${clientId}, user=${authCode.userId}`
            );
            throw createError({ statusCode: 400, message: 'Invalid code_verifier' });
        }
        logger.debug(`PKCE verified for client_id=${clientId}`);
    } else {
        await verifyClient(clientId, clientSecret);
    }

    // Mark code as used
    await prisma.oAuthAuthorizationCode.update({
        where: { code },
        data: { used: true }
    });

    // Create access token as JWT
    const accessToken = issueAccessToken(authCode.userId, authCode.clientId, authCode.scopes);

    // Create refresh token (opaque)
    const refreshTokenValue = generateRefreshToken();

    // Persist both tokens
    await Promise.all([
        prisma.oAuthAccessToken.create({
            data: {
                token: accessToken,
                clientId: authCode.clientId,
                userId: authCode.userId,
                scopes: authCode.scopes,
                expiresAt: new Date(Date.now() + ACCESS_TOKEN_EXPIRES_IN * 1000)
            }
        }),
        prisma.oAuthRefreshToken.create({
            data: {
                token: refreshTokenValue,
                clientId: authCode.clientId,
                userId: authCode.userId,
                scopes: authCode.scopes,
                expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN * 1000)
            }
        })
    ]);

    logger.success(
        `Tokens issued: user=${authCode.userId}, client_id=${clientId}, scopes=[${authCode.scopes.join(', ')}], access_expires_in=${ACCESS_TOKEN_EXPIRES_IN}s, refresh_expires_in=${REFRESH_TOKEN_EXPIRES_IN}s`
    );

    return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_EXPIRES_IN,
        refresh_token: refreshTokenValue,
        scope: authCode.scopes.join(' ')
    };
}

async function handleRefreshToken(body: Record<string, string>) {
    const { refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret } = body;

    if (!refreshToken || !clientId) {
        logger.warn('Rejected: missing refresh_token or client_id');
        throw createError({
            statusCode: 400,
            message: 'Missing required parameters: refresh_token, client_id'
        });
    }

    // Find the refresh token
    const storedRefreshToken = await prisma.oAuthRefreshToken.findUnique({
        where: { token: refreshToken }
    });

    if (!storedRefreshToken) {
        logger.warn(`Rejected: invalid refresh_token from client_id=${clientId}`);
        throw createError({ statusCode: 400, message: 'Invalid refresh_token' });
    }

    if (storedRefreshToken.revoked) {
        logger.warn(
            `Rejected: revoked refresh_token from client_id=${clientId}, user=${storedRefreshToken.userId}`
        );
        throw createError({ statusCode: 400, message: 'Refresh token has been revoked' });
    }

    if (storedRefreshToken.expiresAt < new Date()) {
        logger.warn(
            `Rejected: expired refresh_token from client_id=${clientId}, user=${storedRefreshToken.userId}`
        );
        throw createError({ statusCode: 400, message: 'Refresh token expired' });
    }

    if (storedRefreshToken.clientId !== clientId) {
        logger.warn(
            `Rejected: client_id mismatch for refresh_token, expected=${storedRefreshToken.clientId}, got=${clientId}`
        );
        throw createError({ statusCode: 400, message: 'client_id mismatch' });
    }

    // Verify client_secret for confidential clients
    // Check if the original authorization used PKCE (no secret needed)
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
        throw createError({ statusCode: 400, message: 'Unknown client' });
    }

    // If client_secret is provided, verify it; otherwise we allow PKCE public clients through
    if (clientSecret) {
        const valid = await bcrypt.compare(clientSecret, client.clientSecretHash);
        if (!valid) {
            logger.warn(
                `Rejected: invalid client_secret for "${client.name}" (${clientId}) during refresh`
            );
            throw createError({ statusCode: 401, message: 'Invalid client_secret' });
        }
    }

    // Rotation: revoke old refresh token and issue new ones
    const newAccessToken = issueAccessToken(
        storedRefreshToken.userId,
        storedRefreshToken.clientId,
        storedRefreshToken.scopes
    );
    const newRefreshTokenValue = generateRefreshToken();

    await Promise.all([
        // Revoke old refresh token
        prisma.oAuthRefreshToken.update({
            where: { id: storedRefreshToken.id },
            data: { revoked: true }
        }),
        // Create new access token
        prisma.oAuthAccessToken.create({
            data: {
                token: newAccessToken,
                clientId: storedRefreshToken.clientId,
                userId: storedRefreshToken.userId,
                scopes: storedRefreshToken.scopes,
                expiresAt: new Date(Date.now() + ACCESS_TOKEN_EXPIRES_IN * 1000)
            }
        }),
        // Create new refresh token
        prisma.oAuthRefreshToken.create({
            data: {
                token: newRefreshTokenValue,
                clientId: storedRefreshToken.clientId,
                userId: storedRefreshToken.userId,
                scopes: storedRefreshToken.scopes,
                expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN * 1000)
            }
        })
    ]);

    logger.success(
        `Tokens refreshed: user=${storedRefreshToken.userId}, client_id=${clientId}, scopes=[${storedRefreshToken.scopes.join(', ')}]`
    );

    return {
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_EXPIRES_IN,
        refresh_token: newRefreshTokenValue,
        scope: storedRefreshToken.scopes.join(' ')
    };
}

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const { grant_type: grantType, client_id: clientId } = body;

    logger.info(`Token request: client_id=${clientId}, grant_type=${grantType}`);

    if (grantType === 'authorization_code') {
        return handleAuthorizationCode(body);
    }

    if (grantType === 'refresh_token') {
        return handleRefreshToken(body);
    }

    logger.warn(`Rejected: unsupported grant_type="${grantType}" from client_id=${clientId}`);
    throw createError({
        statusCode: 400,
        message: 'Unsupported grant_type. Use "authorization_code" or "refresh_token".'
    });
});
