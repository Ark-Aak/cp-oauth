import crypto from 'crypto';
import { consola } from 'consola';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, isValidUsername } from '~/utils/username';
import prisma from './prisma';
import { clistFetch } from './clist-fetch';
import { getConfig } from './config';

const logger = consola.withTag('auth:clist');

const CLIST_BASE_URL = 'https://clist.by';
const CLIST_AUTH_URL = 'https://clist.by/o/authorize/';
const CLIST_TOKEN_URL = 'https://clist.by/o/token/';
const CLIST_CODER_ME_URL = 'https://clist.by/api/v4/json/coder/me/';

interface ClistTokenResponse {
    access_token: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
}

export interface ClistIdentity {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
}

// --- PKCE helpers ---

export function generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// --- Authorization URL ---

export function buildClistAuthorizationUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
}): string {
    const url = new URL(CLIST_AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('state', params.state);
    url.searchParams.set('scope', 'read');
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
}

// --- Token exchange ---

export async function exchangeClistAuthorizationCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    codeVerifier: string;
}): Promise<ClistTokenResponse> {
    const formData: Record<string, string> = {
        grant_type: 'authorization_code',
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier
    };

    let result;
    try {
        result = await clistFetch({
            method: 'POST',
            url: CLIST_TOKEN_URL,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            },
            data: formData,
            sessionInit: CLIST_BASE_URL
        });
    } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        throw createError({
            statusCode: err.statusCode || 502,
            message: `Clist token exchange failed: ${err.message || 'Unknown error'}`
        });
    }

    if (result.error) {
        throw createError({
            statusCode: 502,
            message: `Clist token exchange failed: ${result.error}`
        });
    }

    if (result.status >= 400) {
        let detail = `HTTP ${result.status}`;
        try {
            const parsed = JSON.parse(result.body) as {
                error?: string;
                error_description?: string;
            };
            detail = parsed.error_description || parsed.error || detail;
        } catch {
            // body is not JSON
        }
        throw createError({
            statusCode: result.status === 401 ? 401 : 502,
            message: `Clist token exchange failed: ${detail}`
        });
    }

    let token: ClistTokenResponse;
    try {
        token = JSON.parse(result.body) as ClistTokenResponse;
    } catch {
        throw createError({
            statusCode: 502,
            message: 'Clist token response is not valid JSON'
        });
    }

    if (!token.access_token) {
        throw createError({
            statusCode: 502,
            message: 'Clist token response missing access_token'
        });
    }

    logger.info(
        `Clist token exchange result: access_token=${token.access_token.slice(0, 8)}..., ` +
            `refresh_token=${token.refresh_token ? token.refresh_token.slice(0, 8) + '...' : 'NONE'}, ` +
            `expires_in=${token.expires_in ?? 'NONE'}, ` +
            `token_type=${token.token_type ?? 'NONE'}, ` +
            `scope=${token.scope ?? 'NONE'}`
    );

    return token;
}

// --- Token refresh ---

/**
 * Use a refresh_token to obtain a new access_token from Clist.by.
 */
export async function refreshClistAccessToken(refreshToken: string): Promise<ClistTokenResponse> {
    const clientId = (await getConfig('clist_client_id')).trim();
    const clientSecret = (await getConfig('clist_client_secret')).trim();
    if (!clientId || !clientSecret) {
        throw createError({ statusCode: 503, message: 'Clist OAuth is not configured' });
    }

    const formData: Record<string, string> = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
    };

    let result;
    try {
        result = await clistFetch({
            method: 'POST',
            url: CLIST_TOKEN_URL,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            },
            data: formData,
            sessionInit: CLIST_BASE_URL
        });
    } catch (error: unknown) {
        const err = error as { message?: string };
        throw createError({
            statusCode: 502,
            message: `Clist token refresh failed: ${err.message || 'Unknown error'}`
        });
    }

    if (result.error) {
        throw createError({
            statusCode: 502,
            message: `Clist token refresh failed: ${result.error}`
        });
    }

    if (result.status >= 400) {
        let detail = `HTTP ${result.status}`;
        try {
            const parsed = JSON.parse(result.body) as {
                error?: string;
                error_description?: string;
            };
            detail = parsed.error_description || parsed.error || detail;
        } catch {
            // not JSON
        }
        throw createError({
            statusCode: 502,
            message: `Clist token refresh failed: ${detail}`
        });
    }

    let token: ClistTokenResponse;
    try {
        token = JSON.parse(result.body) as ClistTokenResponse;
    } catch {
        throw createError({
            statusCode: 502,
            message: 'Clist token refresh response is not valid JSON'
        });
    }

    if (!token.access_token) {
        throw createError({
            statusCode: 502,
            message: 'Clist token refresh response missing access_token'
        });
    }

    logger.info(
        `Clist token refreshed: access_token=${token.access_token.slice(0, 8)}..., ` +
            `refresh_token=${token.refresh_token ? token.refresh_token.slice(0, 8) + '...' : 'NONE'}, ` +
            `expires_in=${token.expires_in ?? 'NONE'}`
    );

    return token;
}

/**
 * Get a valid Clist access token for a linked account.
 * If the token is expired and a refresh_token exists, refresh it and update the DB.
 * Returns the valid access token string, or null if unavailable.
 */
export async function getValidClistAccessToken(linkedAccountId: string): Promise<string | null> {
    const account = await prisma.linkedAccount.findUnique({
        where: { id: linkedAccountId },
        select: {
            oauthAccessToken: true,
            oauthRefreshToken: true,
            oauthExpiresAt: true
        }
    });

    if (!account?.oauthAccessToken) {
        return null;
    }

    // Check if token is still valid (with 60s buffer)
    const isExpired =
        account.oauthExpiresAt && account.oauthExpiresAt.getTime() < Date.now() + 60_000;

    if (!isExpired) {
        return account.oauthAccessToken;
    }

    // Token expired — try to refresh
    if (!account.oauthRefreshToken) {
        logger.warn(`Clist access token expired for account=${linkedAccountId}, no refresh token`);
        return null;
    }

    logger.info(`Clist access token expired for account=${linkedAccountId}, refreshing...`);

    try {
        const newToken = await refreshClistAccessToken(account.oauthRefreshToken);

        const expiresAt =
            typeof newToken.expires_in === 'number' && Number.isFinite(newToken.expires_in)
                ? new Date(Date.now() + newToken.expires_in * 1000)
                : null;

        await prisma.linkedAccount.update({
            where: { id: linkedAccountId },
            data: {
                oauthAccessToken: newToken.access_token,
                oauthRefreshToken: newToken.refresh_token || account.oauthRefreshToken,
                oauthExpiresAt: expiresAt
            }
        });

        logger.info(`Clist token refreshed and saved for account=${linkedAccountId}`);
        return newToken.access_token;
    } catch (e: unknown) {
        const err = e as { message?: string };
        logger.warn(`Failed to refresh Clist token for account=${linkedAccountId}: ${err.message}`);
        // Return the old token as a fallback — it might still work
        return account.oauthAccessToken;
    }
}

// --- Identity resolution ---

interface ClistCoderMeResponse {
    id?: number;
    handle?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    country?: string;
    display_name?: string;
    is_virtual?: boolean;
}

export async function resolveClistIdentity(accessToken: string): Promise<ClistIdentity> {
    let result;
    try {
        result = await clistFetch({
            method: 'GET',
            url: CLIST_CODER_ME_URL,
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            sessionInit: CLIST_BASE_URL
        });
    } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        logger.warn(`Failed to fetch Clist user info: ${err.message}`);
        throw createError({
            statusCode: err.statusCode || 502,
            message: 'Failed to fetch Clist user info'
        });
    }

    if (result.error) {
        logger.warn(`Failed to fetch Clist user info: ${result.error}`);
        throw createError({
            statusCode: 502,
            message: 'Failed to fetch Clist user info'
        });
    }

    if (result.status >= 400) {
        logger.warn(`Clist user info returned HTTP ${result.status}: ${result.body.slice(0, 200)}`);
        throw createError({
            statusCode: result.status === 401 ? 401 : 502,
            message: 'Failed to fetch Clist user info'
        });
    }

    let coder: ClistCoderMeResponse;
    try {
        const body = result.body.trim();
        if (!body || body.startsWith('<!') || body.startsWith('<html')) {
            throw new Error('Response is HTML, not JSON');
        }
        coder = JSON.parse(body) as ClistCoderMeResponse;
    } catch (parseErr: unknown) {
        const msg = parseErr instanceof Error ? parseErr.message : 'Unknown parse error';
        logger.warn(
            `Clist user info response is not valid JSON: ${msg}, body: ${result.body.slice(0, 300)}`
        );
        throw createError({
            statusCode: 502,
            message: 'Clist user info response is not valid JSON'
        });
    }

    if (!coder.id && !coder.handle) {
        throw createError({
            statusCode: 502,
            message: 'Unable to resolve Clist user identity'
        });
    }

    const platformUid = String(coder.id || coder.handle);
    const platformUsername = coder.handle || platformUid;
    const firstName = coder.first_name?.trim() || '';
    const lastName = coder.last_name?.trim() || '';
    const displayName =
        coder.display_name?.trim() || [firstName, lastName].filter(Boolean).join(' ') || null;
    const email = coder.email?.trim().toLowerCase() || null;

    return {
        platformUid,
        platformUsername,
        email,
        emailVerified: false,
        displayName,
        avatarUrl: null
    };
}

// --- Username helpers (reused pattern from codeforces-oauth.ts) ---

function sanitizeUsername(candidate: string): string {
    const normalized = candidate
        .trim()
        .toLowerCase()
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    const fallback = normalized.length > 0 ? normalized : 'clist_user';
    const clipped = fallback.slice(0, USERNAME_MAX_LENGTH);
    if (clipped.length >= USERNAME_MIN_LENGTH) {
        return clipped;
    }
    return `${clipped}${'x'.repeat(USERNAME_MIN_LENGTH - clipped.length)}`;
}

export async function getClistUniqueUsername(base: string): Promise<string> {
    const sanitized = sanitizeUsername(base);
    if (isValidUsername(sanitized)) {
        const exists = await prisma.user.findFirst({
            where: {
                username: {
                    equals: sanitized,
                    mode: 'insensitive'
                }
            },
            select: { id: true }
        });
        if (!exists) {
            return sanitized;
        }
    }

    for (let i = 1; i <= 9999; i += 1) {
        const suffix = `_${i}`;
        const head = sanitized.slice(0, USERNAME_MAX_LENGTH - suffix.length);
        const candidate = `${head}${suffix}`;
        if (!isValidUsername(candidate)) {
            continue;
        }
        const exists = await prisma.user.findFirst({
            where: {
                username: {
                    equals: candidate,
                    mode: 'insensitive'
                }
            },
            select: { id: true }
        });
        if (!exists) {
            return candidate;
        }
    }

    throw createError({
        statusCode: 500,
        message: 'Unable to allocate username for Clist user'
    });
}
