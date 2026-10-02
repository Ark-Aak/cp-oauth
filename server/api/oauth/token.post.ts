import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Prisma } from '@prisma/client';
import prisma from '~/server/utils/prisma';
import { hashToken } from '~/server/utils/token-hash';
import {
    authenticateOAuthClient,
    generateRefreshToken,
    handleOAuthRequest,
    OAuthProtocolError,
    PKCE_VERIFIER_PATTERN,
    validateScopes,
    verifyPKCE,
    withOAuthGrantLock
} from '~/server/utils/oauth';
import {
    parseOAuthScopes,
    readOAuthTokenBody,
    requireOAuthParameter
} from '~/server/utils/oauth-request';

const ACCESS_TOKEN_EXPIRES_IN = 3600;
const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 3600;

/** Called only after conditional grant consumption, and rolled back with that consumption. */
async function issueOAuthTokens(
    tx: Prisma.TransactionClient,
    grant: { userId: string; clientId: string; scopes: string[]; clientAuthRequired: boolean }
) {
    const now = Date.now();
    const accessToken = jwt.sign(
        {
            sub: grant.userId,
            client_id: grant.clientId,
            scopes: grant.scopes,
            type: 'oauth_access'
        },
        useRuntimeConfig().jwtSecret,
        {
            algorithm: 'HS256',
            jwtid: randomUUID(),
            expiresIn: ACCESS_TOKEN_EXPIRES_IN
        }
    );
    const refreshToken = generateRefreshToken();
    await tx.oAuthAccessToken.create({
        data: {
            ...grant,
            tokenHash: hashToken(accessToken),
            expiresAt: new Date(now + ACCESS_TOKEN_EXPIRES_IN * 1000)
        }
    });
    await tx.oAuthRefreshToken.create({
        data: {
            ...grant,
            tokenHash: hashToken(refreshToken),
            expiresAt: new Date(now + REFRESH_TOKEN_EXPIRES_IN * 1000)
        }
    });
    return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_EXPIRES_IN,
        refresh_token: refreshToken,
        scope: grant.scopes.join(' ')
    };
}

async function exchangeAuthorizationCode(body: Record<string, string>) {
    const codeHash = hashToken(requireOAuthParameter(body, 'code'));
    const clientId = requireOAuthParameter(body, 'client_id');
    const redirectUri = requireOAuthParameter(body, 'redirect_uri');
    if (body.code_verifier !== undefined && !PKCE_VERIFIER_PATTERN.test(body.code_verifier)) {
        throw new OAuthProtocolError('invalid_request', 'Invalid code_verifier format');
    }
    const candidate = await prisma.oAuthAuthorizationCode.findUnique({
        where: { codeHash },
        select: { userId: true, clientId: true }
    });
    if (!candidate || candidate.clientId !== clientId) {
        throw new OAuthProtocolError('invalid_grant', 'Invalid authorization code');
    }
    return prisma.$transaction(
        async tx => {
            await withOAuthGrantLock(tx, candidate.userId, clientId);
            const code = await tx.oAuthAuthorizationCode.findUnique({ where: { codeHash } });
            if (
                !code ||
                code.used ||
                code.clientId !== clientId ||
                code.redirectUri !== redirectUri ||
                code.expiresAt.getTime() <= Date.now()
            ) {
                throw new OAuthProtocolError('invalid_grant', 'Invalid authorization code');
            }
            const clientAuthRequired = !code.codeChallengeHash || body.client_secret !== undefined;
            await authenticateOAuthClient(clientId, body.client_secret, clientAuthRequired, tx);
            if (code.codeChallengeHash) {
                if (body.code_verifier === undefined) {
                    throw new OAuthProtocolError('invalid_request', 'code_verifier is required');
                }
                if (
                    !verifyPKCE(
                        body.code_verifier,
                        code.codeChallengeHash,
                        code.codeChallengeMethod
                    )
                ) {
                    throw new OAuthProtocolError('invalid_grant', 'Invalid code_verifier');
                }
            }
            if (!validateScopes(code.scopes)) {
                throw new OAuthProtocolError('invalid_scope', 'Invalid authorization scopes');
            }
            const consumed = await tx.oAuthAuthorizationCode.updateMany({
                where: {
                    id: code.id,
                    clientId,
                    userId: candidate.userId,
                    redirectUri,
                    used: false,
                    expiresAt: { gt: new Date() }
                },
                data: { used: true }
            });
            if (consumed.count !== 1) {
                throw new OAuthProtocolError('invalid_grant', 'Invalid authorization code');
            }
            return issueOAuthTokens(tx, {
                userId: code.userId,
                clientId,
                scopes: code.scopes,
                clientAuthRequired
            });
        },
        { maxWait: 10000, timeout: 15000 }
    );
}

async function rotateRefreshToken(body: Record<string, string>) {
    const tokenHash = hashToken(requireOAuthParameter(body, 'refresh_token'));
    const clientId = requireOAuthParameter(body, 'client_id');
    const candidate = await prisma.oAuthRefreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true, clientId: true }
    });
    if (!candidate || candidate.clientId !== clientId) {
        throw new OAuthProtocolError('invalid_grant', 'Invalid refresh token');
    }
    return prisma.$transaction(
        async tx => {
            await withOAuthGrantLock(tx, candidate.userId, clientId);
            const refresh = await tx.oAuthRefreshToken.findUnique({ where: { tokenHash } });
            if (
                !refresh ||
                refresh.revoked ||
                refresh.clientId !== clientId ||
                refresh.expiresAt.getTime() <= Date.now()
            ) {
                throw new OAuthProtocolError('invalid_grant', 'Invalid refresh token');
            }
            await authenticateOAuthClient(
                clientId,
                body.client_secret,
                refresh.clientAuthRequired,
                tx
            );
            const scopes = body.scope === undefined ? refresh.scopes : parseOAuthScopes(body.scope);
            if (!validateScopes(scopes) || !scopes.every(scope => refresh.scopes.includes(scope))) {
                throw new OAuthProtocolError(
                    'invalid_scope',
                    'Refresh scopes must be a subset of the original grant'
                );
            }
            const consumed = await tx.oAuthRefreshToken.updateMany({
                where: {
                    id: refresh.id,
                    clientId,
                    userId: candidate.userId,
                    revoked: false,
                    expiresAt: { gt: new Date() }
                },
                data: { revoked: true }
            });
            if (consumed.count !== 1) {
                throw new OAuthProtocolError('invalid_grant', 'Invalid refresh token');
            }
            return issueOAuthTokens(tx, {
                userId: refresh.userId,
                clientId,
                scopes,
                clientAuthRequired: refresh.clientAuthRequired
            });
        },
        { maxWait: 10000, timeout: 15000 }
    );
}

export default defineEventHandler(event =>
    handleOAuthRequest(event, async () => {
        const body = await readOAuthTokenBody(event);
        const grantType = requireOAuthParameter(body, 'grant_type');
        if (body.client_secret === '') {
            throw new OAuthProtocolError('invalid_client', 'Invalid client credentials');
        }
        if (grantType === 'authorization_code') return exchangeAuthorizationCode(body);
        if (grantType === 'refresh_token') return rotateRefreshToken(body);
        throw new OAuthProtocolError('unsupported_grant_type', 'Unsupported grant_type');
    })
);
