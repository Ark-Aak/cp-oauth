import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { setHeader, setResponseStatus, type H3Event } from 'h3';
import prisma from '~/server/utils/prisma';
import { lockAuthUser } from '~/server/utils/auth';
import { hashToken } from '~/server/utils/token-hash';
import { SCOPES, type ScopeName } from '~/utils/oauth-scopes';

export type OAuthErrorCode =
    | 'invalid_request'
    | 'invalid_client'
    | 'invalid_grant'
    | 'invalid_scope'
    | 'unsupported_grant_type'
    | 'invalid_token';

export class OAuthProtocolError extends Error {
    constructor(
        public readonly code: OAuthErrorCode,
        description: string
    ) {
        super(description);
        this.name = 'OAuthProtocolError';
    }
}

export function setOAuthNoStore(event: H3Event): void {
    setHeader(event, 'Cache-Control', 'no-store');
    setHeader(event, 'Pragma', 'no-cache');
}

export async function handleOAuthRequest<T>(
    event: H3Event,
    handler: () => Promise<T>,
    databaseError: OAuthErrorCode = 'invalid_grant'
): Promise<T | { error: OAuthErrorCode; error_description: string }> {
    setOAuthNoStore(event);
    try {
        return await handler();
    } catch (error) {
        const databaseCode = (error as { code?: string } | null)?.code;
        const protocolError =
            error instanceof OAuthProtocolError
                ? error
                : ['P2002', 'P2003', 'P2025'].includes(databaseCode ?? '')
                  ? new OAuthProtocolError(databaseError, 'The OAuth request is no longer valid')
                  : null;
        if (!protocolError) throw error;
        setResponseStatus(
            event,
            protocolError.code === 'invalid_client' || protocolError.code === 'invalid_token'
                ? 401
                : 400
        );
        if (protocolError.code === 'invalid_token') {
            setHeader(event, 'WWW-Authenticate', 'Bearer error="invalid_token"');
        }
        return { error: protocolError.code, error_description: protocolError.message };
    }
}

export function validateScopes(scopes: string[]): scopes is ScopeName[] {
    return scopes.length > 0 && scopes.every(scope => Object.hasOwn(SCOPES, scope));
}

export function generateCode(): string {
    return randomBytes(32).toString('hex');
}

export function generateRefreshToken(): string {
    return randomBytes(64).toString('hex');
}

export function generateClientSecret(): string {
    return randomBytes(32).toString('base64url');
}

export const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
export const PKCE_S256_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function verifyPKCE(
    codeVerifier: string,
    codeChallengeHash: string,
    method: string | null
): boolean {
    if (!PKCE_VERIFIER_PATTERN.test(codeVerifier)) return false;
    let challenge: string;
    if (!method || method === 'plain') {
        challenge = codeVerifier;
    } else if (method === 'S256') {
        challenge = createHash('sha256').update(codeVerifier).digest('base64url');
    } else {
        return false;
    }
    if (!/^[a-f0-9]{64}$/.test(codeChallengeHash)) return false;
    return timingSafeEqual(
        Buffer.from(hashToken(challenge), 'hex'),
        Buffer.from(codeChallengeHash, 'hex')
    );
}

/** A missing secret is permitted only by the grant that the endpoint has validated. */
export async function authenticateOAuthClient(
    clientId: string,
    clientSecret: string | undefined,
    required: boolean,
    database: Pick<Prisma.TransactionClient, 'oAuthClient'> = prisma
) {
    if (clientSecret === '' || (required && clientSecret === undefined)) {
        throw new OAuthProtocolError('invalid_client', 'Invalid client credentials');
    }
    const client = await database.oAuthClient.findUnique({ where: { clientId } });
    if (
        !client ||
        (clientSecret !== undefined &&
            !(await bcrypt.compare(clientSecret, client.clientSecretHash)))
    ) {
        throw new OAuthProtocolError('invalid_client', 'Invalid client credentials');
    }
    return client;
}

/** Always acquire the recovery/user lock before the narrower user/client grant lock. */
export async function withOAuthGrantLock(
    tx: Prisma.TransactionClient,
    userId: string,
    clientId: string
): Promise<void> {
    await lockAuthUser(tx, userId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'oauth:' + userId + ':' + clientId}, 0))`;
}
