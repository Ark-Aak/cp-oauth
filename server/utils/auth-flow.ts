import { randomBytes } from 'node:crypto';
import { getCookie, setCookie, createError, type H3Event } from 'h3';
import { hashToken } from './token-hash';
import { getRedisJsonWithRaw, setRedisJson, deleteRedisKeyIfValue } from './security';

const FLOW_COOKIE = 'cp_oauth_flow';
export const AUTH_FLOW_TTL_SECONDS = 600;
export const AUTH_RANDOM_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function ensureAuthFlowHash(event: H3Event): string {
    const existing = getCookie(event, FLOW_COOKIE);
    const value =
        existing && AUTH_RANDOM_ID_PATTERN.test(existing)
            ? existing
            : randomBytes(32).toString('base64url');
    setCookie(event, FLOW_COOKIE, value, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !import.meta.dev,
        path: '/',
        maxAge: AUTH_FLOW_TTL_SECONDS
    });
    return hashToken(value);
}

export function assertAuthFlowHash(event: H3Event, expectedHash: string): void {
    const value = getCookie(event, FLOW_COOKIE);
    if (!value || !AUTH_RANDOM_ID_PATTERN.test(value) || hashToken(value) !== expectedHash) {
        throw createError({
            statusCode: 400,
            message: 'Authentication flow belongs to another browser or has expired',
            data: { code: 'AUTH_CHALLENGE_EXPIRED' }
        });
    }
}

export async function storeAuthFlow(key: string, state: unknown): Promise<void> {
    try {
        await setRedisJson(key, state, AUTH_FLOW_TTL_SECONDS);
    } catch {
        throw createError({ statusCode: 503, message: 'Authentication state is unavailable' });
    }
}

export async function readAuthFlow<T>(key: string): Promise<{ raw: string; value: T }> {
    let pending: { raw: string; value: T } | null;
    try {
        pending = await getRedisJsonWithRaw<T>(key);
    } catch {
        throw createError({ statusCode: 503, message: 'Authentication state is unavailable' });
    }
    if (!pending) {
        throw createError({
            statusCode: 400,
            message: 'Authentication flow has expired or already been used',
            data: { code: 'AUTH_CHALLENGE_EXPIRED' }
        });
    }
    return pending;
}

export async function consumeAuthFlow(key: string, raw: string): Promise<void> {
    let consumed: boolean;
    try {
        consumed = await deleteRedisKeyIfValue(key, raw);
    } catch {
        throw createError({ statusCode: 503, message: 'Authentication state is unavailable' });
    }
    if (!consumed) {
        throw createError({
            statusCode: 400,
            message: 'Authentication flow has expired or already been used',
            data: { code: 'AUTH_CHALLENGE_EXPIRED' }
        });
    }
}
