import { consola } from 'consola';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, isValidUsername } from '~/utils/username';
import prisma from './prisma';

const logger = consola.withTag('auth:codeforces');
const CODEFORCES_ISSUER = 'https://codeforces.com';
const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000;

interface CodeforcesDiscoveryMetadata {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint?: string;
}

interface CodeforcesTokenResponse {
    access_token: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    id_token?: string;
}

interface CodeforcesIdentity {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
}

function toBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
    }
    return null;
}

let discoveryCache: { value: CodeforcesDiscoveryMetadata; expiresAt: number } | null = null;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split('.');
        const rawPayload = parts[1];
        if (!rawPayload) {
            return null;
        }
        const payload = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<
            string,
            unknown
        >;
    } catch {
        return null;
    }
}

function toStringOrNull(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

export async function getCodeforcesDiscoveryMetadata(): Promise<CodeforcesDiscoveryMetadata> {
    const now = Date.now();
    if (discoveryCache && now < discoveryCache.expiresAt) {
        return discoveryCache.value;
    }

    const metadata = await $fetch<CodeforcesDiscoveryMetadata>(
        `${CODEFORCES_ISSUER}/.well-known/openid-configuration`
    );

    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
        throw createError({ statusCode: 502, message: 'Invalid Codeforces discovery document' });
    }

    discoveryCache = {
        value: metadata,
        expiresAt: now + DISCOVERY_CACHE_TTL_MS
    };
    return metadata;
}

export async function buildCodeforcesAuthorizationUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
}): Promise<string> {
    const discovery = await getCodeforcesDiscoveryMetadata();
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', 'openid profile');
    url.searchParams.set('state', params.state);
    return url.toString();
}

export async function exchangeCodeforcesAuthorizationCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}): Promise<{ token: CodeforcesTokenResponse; discovery: CodeforcesDiscoveryMetadata }> {
    const discovery = await getCodeforcesDiscoveryMetadata();
    const formBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri
    });

    let rawData: unknown;
    try {
        const response = await $fetch.raw(discovery.token_endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                accept: 'application/json, application/x-www-form-urlencoded, text/plain'
            },
            body: formBody.toString()
        });
        rawData = response._data;
    } catch (error: unknown) {
        const err = error as {
            statusCode?: number;
            data?: { error?: string; error_description?: string };
            message?: string;
        };
        const detail =
            err.data?.error_description || err.data?.error || err.message || 'Unknown error';
        throw createError({
            statusCode: err.statusCode || 502,
            message: `Codeforces token exchange failed: ${detail}`
        });
    }

    let token: CodeforcesTokenResponse;
    if (typeof rawData === 'string') {
        const asQuery = new URLSearchParams(rawData);
        token = {
            access_token: asQuery.get('access_token') || '',
            token_type: asQuery.get('token_type') || undefined,
            expires_in: asQuery.get('expires_in') ? Number(asQuery.get('expires_in')) : undefined,
            refresh_token: asQuery.get('refresh_token') || undefined,
            scope: asQuery.get('scope') || undefined,
            id_token: asQuery.get('id_token') || undefined
        };
    } else {
        token = (rawData || {}) as CodeforcesTokenResponse;
    }

    if (!token.access_token) {
        throw createError({
            statusCode: 502,
            message: 'Codeforces token response missing access_token'
        });
    }

    return { token, discovery };
}

export async function resolveCodeforcesIdentity(params: {
    token: CodeforcesTokenResponse;
    discovery: CodeforcesDiscoveryMetadata;
}): Promise<CodeforcesIdentity> {
    let claims: Record<string, unknown> = {};

    if (params.discovery.userinfo_endpoint) {
        try {
            const userinfo = await $fetch<Record<string, unknown>>(
                params.discovery.userinfo_endpoint,
                {
                    headers: {
                        Authorization: `Bearer ${params.token.access_token}`
                    }
                }
            );
            claims = userinfo;
        } catch (error) {
            logger.warn('Failed to load userinfo from Codeforces, fallback to id_token');
            logger.debug(error);
        }
    }

    if (Object.keys(claims).length === 0 && params.token.id_token) {
        const decoded = decodeJwtPayload(params.token.id_token);
        if (decoded) {
            claims = decoded;
        }
    }

    const platformUid =
        toStringOrNull(claims.sub) ||
        toStringOrNull(claims.preferred_username) ||
        toStringOrNull(claims.nickname);
    const platformUsername =
        toStringOrNull(claims.preferred_username) ||
        toStringOrNull(claims.nickname) ||
        toStringOrNull(claims.handle) ||
        platformUid;

    if (!platformUid || !platformUsername) {
        throw createError({
            statusCode: 502,
            message: 'Unable to resolve Codeforces user identity'
        });
    }

    return {
        platformUid,
        platformUsername,
        email: toStringOrNull(claims.email),
        emailVerified: toBoolean(claims.email_verified) ?? false,
        displayName: toStringOrNull(claims.name),
        avatarUrl: toStringOrNull(claims.picture)
    };
}

function sanitizeUsername(candidate: string): string {
    const normalized = candidate
        .trim()
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    const fallback = normalized.length > 0 ? normalized : 'cf_user';
    const clipped = fallback.slice(0, USERNAME_MAX_LENGTH);
    if (clipped.length >= USERNAME_MIN_LENGTH) {
        return clipped;
    }
    return `${clipped}${'x'.repeat(USERNAME_MIN_LENGTH - clipped.length)}`;
}

export async function getUniqueUsername(base: string): Promise<string> {
    const sanitized = sanitizeUsername(base);
    if (isValidUsername(sanitized)) {
        const exists = await prisma.user.findUnique({
            where: { username: sanitized },
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
        const exists = await prisma.user.findUnique({
            where: { username: candidate },
            select: { id: true }
        });
        if (!exists) {
            return candidate;
        }
    }

    throw createError({
        statusCode: 500,
        message: 'Unable to allocate username for Codeforces user'
    });
}
