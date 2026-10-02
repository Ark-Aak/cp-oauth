import { randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createError, isError } from 'h3';
import { z } from 'zod';
import prisma from './prisma';
import { clistFetch } from './clist-fetch';
import { getConfig } from './config';
import { getRedis } from './redis';
import { deleteRedisKeyIfValue } from './security';
import { decryptLinkedAccountToken, encryptLinkedAccountTokens } from './linked-account-tokens';

const CLIST_BASE_URL = 'https://clist.by';
const CLIST_AUTH_URL = 'https://clist.by/o/authorize/';
const CLIST_TOKEN_URL = 'https://clist.by/o/token/';
const CLIST_CODER_ME_URL = 'https://clist.by/api/v4/json/coder/me/';

export interface ClistTokenResponse {
    access_token: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
}

const tokenResponseSchema = z.object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().finite().positive().optional(),
    refresh_token: z.string().optional(),
    scope: z.string().optional()
});

export interface ClistIdentity {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
}

export function generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

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

async function requestClistJson<T extends z.ZodType>(
    params: Parameters<typeof clistFetch>[0],
    schema: T
): Promise<z.output<T>> {
    let result;
    try {
        result = await clistFetch(params);
    } catch (error) {
        const statusCode =
            isError(error) && [503, 504].includes(error.statusCode) ? error.statusCode : 502;
        throw createError({ statusCode, message: 'Clist provider request failed' });
    }
    if (result.error || result.status < 200 || result.status >= 300) {
        throw createError({
            statusCode: result.error === 'timeout' ? 504 : 502,
            message: 'Clist provider request failed'
        });
    }
    let value: unknown;
    try {
        value = JSON.parse(result.body);
    } catch {
        throw createError({ statusCode: 502, message: 'Invalid Clist provider response' });
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success)
        throw createError({ statusCode: 502, message: 'Invalid Clist provider response' });
    return parsed.data;
}

export async function exchangeClistAuthorizationCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    codeVerifier: string;
}): Promise<ClistTokenResponse> {
    const token = await requestClistJson(
        {
            method: 'POST',
            url: CLIST_TOKEN_URL,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            },
            data: {
                grant_type: 'authorization_code',
                code: params.code,
                client_id: params.clientId,
                client_secret: params.clientSecret,
                redirect_uri: params.redirectUri,
                code_verifier: params.codeVerifier
            },
            sessionInit: CLIST_BASE_URL
        },
        tokenResponseSchema
    );
    return token;
}

export async function refreshClistAccessToken(refreshToken: string): Promise<ClistTokenResponse> {
    const config = await getConfig(['clist_client_id', 'clist_client_secret']);
    const clientId = config.clist_client_id.trim();
    const clientSecret = config.clist_client_secret.trim();
    if (!clientId || !clientSecret) {
        throw createError({ statusCode: 503, message: 'Clist OAuth is not configured' });
    }
    const token = await requestClistJson(
        {
            method: 'POST',
            url: CLIST_TOKEN_URL,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            },
            data: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret
            },
            sessionInit: CLIST_BASE_URL
        },
        tokenResponseSchema
    );
    return token;
}

export async function getValidClistAccessToken(linkedAccountId: string): Promise<string | null> {
    const query = {
        where: { id: linkedAccountId },
        select: {
            platform: true,
            oauthAccessToken: true,
            oauthRefreshToken: true,
            oauthExpiresAt: true
        }
    } as const;
    const account = await prisma.linkedAccount.findUnique(query);
    if (!account || account.platform !== 'clist' || !account.oauthAccessToken) return null;
    const accessToken = decryptLinkedAccountToken(
        linkedAccountId,
        'oauthAccessToken',
        account.oauthAccessToken
    );
    if (!account.oauthExpiresAt || account.oauthExpiresAt.getTime() > Date.now() + 60_000)
        return accessToken;
    if (!account.oauthRefreshToken) return null;
    const lockKey = `clist:refresh:${linkedAccountId}`;
    const owner = randomBytes(32).toString('base64url');
    let acquired: string | null;
    try {
        acquired = await getRedis().set(lockKey, owner, 'PX', 30_000, 'NX');
    } catch {
        return null;
    }
    if (acquired !== 'OK') {
        const deadline = Date.now() + 25_000;
        while (Date.now() < deadline) {
            await delay(250);
            const current = await prisma.linkedAccount.findUnique(query);
            if (!current?.oauthAccessToken || current.platform !== 'clist') return null;
            if (!current.oauthExpiresAt || current.oauthExpiresAt.getTime() > Date.now() + 60_000) {
                return decryptLinkedAccountToken(
                    linkedAccountId,
                    'oauthAccessToken',
                    current.oauthAccessToken
                );
            }
        }
        return null;
    }
    try {
        const current = await prisma.linkedAccount.findUnique(query);
        if (!current?.oauthAccessToken || current.platform !== 'clist') return null;
        if (!current.oauthExpiresAt || current.oauthExpiresAt.getTime() > Date.now() + 60_000) {
            return decryptLinkedAccountToken(
                linkedAccountId,
                'oauthAccessToken',
                current.oauthAccessToken
            );
        }
        const refreshToken = decryptLinkedAccountToken(
            linkedAccountId,
            'oauthRefreshToken',
            current.oauthRefreshToken
        );
        if (!refreshToken) return null;
        let token: ClistTokenResponse;
        try {
            token = await refreshClistAccessToken(refreshToken);
        } catch (error) {
            if (isError(error) && error.statusCode === 503) throw error;
            return null;
        }
        const expiresAt =
            typeof token.expires_in === 'number' &&
            Number.isFinite(token.expires_in) &&
            token.expires_in > 0
                ? new Date(Date.now() + token.expires_in * 1000)
                : null;
        const updated = await prisma.linkedAccount.updateMany({
            where: {
                id: linkedAccountId,
                oauthRefreshToken: current.oauthRefreshToken,
                oauthAccessToken: current.oauthAccessToken
            },
            data: {
                ...encryptLinkedAccountTokens(linkedAccountId, {
                    oauthAccessToken: token.access_token,
                    oauthRefreshToken: token.refresh_token || refreshToken
                }),
                oauthExpiresAt: expiresAt,
                oauthTokenType: token.token_type || null,
                oauthScope: token.scope || null
            }
        });
        return updated.count === 1 ? token.access_token : null;
    } finally {
        try {
            await deleteRedisKeyIfValue(lockKey, owner);
        } catch {
            // The bounded lock expires even if Redis disconnects after the database update.
        }
    }
}

const coderResponseSchema = z.object({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    handle: z.string().trim().min(1),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    email: z.string().nullish(),
    display_name: z.string().nullish()
});

export async function resolveClistIdentity(accessToken: string): Promise<ClistIdentity> {
    const coder = await requestClistJson(
        {
            method: 'GET',
            url: CLIST_CODER_ME_URL,
            headers: { Authorization: `Bearer ${accessToken}` },
            sessionInit: CLIST_BASE_URL
        },
        coderResponseSchema
    );
    const firstName = typeof coder.first_name === 'string' ? coder.first_name.trim() : '';
    const lastName = typeof coder.last_name === 'string' ? coder.last_name.trim() : '';
    return {
        platformUid: String(coder.id),
        platformUsername: coder.handle,
        email: typeof coder.email === 'string' ? coder.email.trim().toLowerCase() || null : null,
        emailVerified: false,
        displayName:
            coder.display_name?.trim() || [firstName, lastName].filter(Boolean).join(' ') || null,
        avatarUrl: null
    };
}
