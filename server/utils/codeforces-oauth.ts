import jwt from 'jsonwebtoken';
import { createError } from 'h3';
import { z } from 'zod';

const CODEFORCES_ISSUER = 'https://codeforces.com';
const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000;

const discoverySchema = z.object({
    issuer: z.literal(CODEFORCES_ISSUER),
    authorization_endpoint: z.string(),
    token_endpoint: z.string(),
    id_token_signing_alg_values_supported: z.array(z.string())
});
export type CodeforcesDiscoveryMetadata = z.infer<typeof discoverySchema>;
const tokenSchema = z.object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().finite().positive().optional(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
    id_token: z.string().optional()
});
export type CodeforcesTokenResponse = z.infer<typeof tokenSchema>;
const identityClaimsSchema = z.object({
    sub: z.string().trim().min(1),
    handle: z.string().trim().min(1),
    exp: z.number().finite(),
    iat: z.number().finite(),
    email: z.string().optional(),
    email_verified: z.boolean().optional(),
    name: z.string().optional(),
    avatar: z.string().optional()
});

let discoveryCache: { value: CodeforcesDiscoveryMetadata; expiresAt: number } | null = null;

function validEndpoint(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:' &&
            url.origin === CODEFORCES_ISSUER &&
            !url.username &&
            !url.password &&
            !url.hash
        );
    } catch {
        return false;
    }
}

export async function getCodeforcesDiscoveryMetadata(): Promise<CodeforcesDiscoveryMetadata> {
    if (discoveryCache && Date.now() < discoveryCache.expiresAt) return discoveryCache.value;
    let response: unknown;
    try {
        response = await $fetch(`${CODEFORCES_ISSUER}/.well-known/openid-configuration`, {
            timeout: 10_000,
            retry: 0,
            redirect: 'error'
        });
    } catch {
        throw createError({ statusCode: 502, message: 'Codeforces discovery is unavailable' });
    }
    const parsed = discoverySchema.safeParse(response);
    if (
        !parsed.success ||
        !validEndpoint(parsed.data.authorization_endpoint) ||
        !validEndpoint(parsed.data.token_endpoint) ||
        !parsed.data.id_token_signing_alg_values_supported.includes('HS256')
    ) {
        throw createError({
            statusCode: 502,
            message: 'Codeforces does not support the required HS256 identity protocol'
        });
    }
    const metadata = parsed.data;
    discoveryCache = { value: metadata, expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS };
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
    url.searchParams.set('scope', 'openid');
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
    const form = new URLSearchParams({
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
            timeout: 10_000,
            retry: 0,
            redirect: 'error',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                accept: 'application/json, application/x-www-form-urlencoded, text/plain'
            },
            body: form.toString()
        });
        rawData = response._data;
    } catch {
        throw createError({ statusCode: 502, message: 'Codeforces token exchange failed' });
    }
    let value: unknown;
    if (typeof rawData === 'string') {
        const formData = new URLSearchParams(rawData);
        const expiresIn = formData.get('expires_in');
        value = {
            access_token: formData.get('access_token') || '',
            token_type: formData.get('token_type') || undefined,
            expires_in: expiresIn ? Number(expiresIn) : undefined,
            refresh_token: formData.get('refresh_token') || undefined,
            scope: formData.get('scope') || undefined,
            id_token: formData.get('id_token') || undefined
        };
    } else {
        value = rawData;
    }
    const parsed = tokenSchema.safeParse(value);
    if (!parsed.success)
        throw createError({ statusCode: 502, message: 'Invalid Codeforces token response' });
    return { token: parsed.data, discovery };
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function resolveCodeforcesIdentity(params: {
    token: CodeforcesTokenResponse;
    discovery: CodeforcesDiscoveryMetadata;
    clientId: string;
    clientSecret: string;
}) {
    if (
        params.discovery.issuer !== CODEFORCES_ISSUER ||
        !params.discovery.id_token_signing_alg_values_supported?.includes('HS256') ||
        typeof params.token.id_token !== 'string' ||
        !params.clientId ||
        !params.clientSecret
    ) {
        throw createError({
            statusCode: 502,
            message: 'Codeforces verified identity is unavailable'
        });
    }
    let claims: z.infer<typeof identityClaimsSchema>;
    try {
        const verified = jwt.verify(params.token.id_token, params.clientSecret, {
            algorithms: ['HS256'],
            issuer: CODEFORCES_ISSUER,
            audience: params.clientId
        });
        claims = identityClaimsSchema.parse(verified);
    } catch {
        throw createError({
            statusCode: 502,
            message: 'Codeforces identity signature or claims are invalid'
        });
    }
    return {
        platformUid: claims.sub,
        platformUsername: claims.handle,
        email: optionalString(claims.email),
        emailVerified: claims.email_verified === true,
        displayName: optionalString(claims.name) || claims.handle.trim(),
        avatarUrl: optionalString(claims.avatar)
    };
}
