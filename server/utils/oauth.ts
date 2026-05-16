import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';

export const SCOPES = {
    openid: 'Base identity (user ID)',
    profile: 'Username, avatar, and bio',
    email: 'Email address',
    'cp:linked': 'Linked competitive programming accounts',
    'link:luogu': 'Read linked Luogu account info',
    'link:atcoder': 'Read linked AtCoder account info',
    'link:codeforces': 'Read linked Codeforces account info',
    'link:github': 'Read linked GitHub account info',
    'link:google': 'Read linked Google account info',
    'link:clist': 'Read linked Clist account info',
    'cp:summary': 'Aggregated competitive programming stats',
    'cp:details': 'Full submission history and rating trends'
} as const;

export type ScopeName = keyof typeof SCOPES;

export function validateScopes(scopes: string[]): scopes is ScopeName[] {
    return scopes.every(s => s in SCOPES);
}

export function generateCode(): string {
    return crypto.randomBytes(32).toString('hex');
}

export function generateToken(): string {
    return crypto.randomBytes(48).toString('hex');
}

export function generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
}

export function generateClientSecret(): string {
    return crypto.randomBytes(32).toString('base64url');
}

export function verifyPKCE(
    codeVerifier: string,
    codeChallenge: string,
    method: string | null
): boolean {
    if (!method || method === 'plain') {
        return codeVerifier === codeChallenge;
    }
    if (method === 'S256') {
        const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
        return hash === codeChallenge;
    }
    return false;
}
/**
 * Authenticates an OAuth client by verifying client_id and client_secret.
 *
 * Per OAuth 2.0 (RFC 6749 §2.3.1) and RFC 7009 §2.1, confidential clients
 * MUST be authenticated when calling token / revoke endpoints. cp-oauth's
 * data model requires every client to have a secret (clientSecretHash is
 * non-nullable), so all clients are treated as confidential.
 *
 * Returns the client record on success; throws on any failure.
 *
 * Error responses intentionally don't distinguish "unknown client" from
 * "wrong secret" to prevent client_id enumeration.
 */
export async function authenticateOAuthClient(
    clientId: string | undefined,
    clientSecret: string | undefined
) {
    if (!clientId) {
        throw createError({ statusCode: 400, message: 'client_id required' });
    }
    if (!clientSecret) {
        throw createError({ statusCode: 400, message: 'client_secret required' });
    }
    const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
    if (!client) {
        throw createError({ statusCode: 401, message: 'Invalid client credentials' });
    }
    const valid = await bcrypt.compare(clientSecret, client.clientSecretHash);
    if (!valid) {
        throw createError({ statusCode: 401, message: 'Invalid client credentials' });
    }
    return client;
}
