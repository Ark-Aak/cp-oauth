import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { createError, deleteCookie, getCookie, setCookie, type H3Event } from 'h3';
import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';
import { hashToken } from '~/server/utils/token-hash';
import { securityRedis } from '~/server/utils/security';

const SESSION_COOKIE = 'cp_oauth_session';
const SESSION_TTL = 7 * 24 * 60 * 60;
const SESSION_PREFIX = 'cp-oauth:v2:auth:session:';
const USER_SESSIONS_PREFIX = 'cp-oauth:v2:auth:user-sessions:';

export type AuthContext = {
    userId: string;
    sessionId: string;
    authVersion: number;
    role: string;
};

type StoredSession = { userId: string; authVersion: number };
const storedSessionSchema = z
    .object({
        userId: z.string().min(1),
        authVersion: z.number().int().nonnegative()
    })
    .strict();

function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    };
}

export function clearAuthCookies(event: H3Event): void {
    deleteCookie(event, SESSION_COOKIE, cookieOptions());
    deleteCookie(event, 'auth_token', { path: '/' });
    delete event.context.authUserId;
    delete event.context.authSessionId;
    delete event.context.authVersion;
    delete event.context.authRole;
}

function getCookieSessionId(event: H3Event): string | null {
    const sid = getCookie(event, SESSION_COOKIE);
    return sid && /^[A-Za-z0-9_-]{43}$/.test(sid) ? hashToken(sid) : null;
}

function parseSession(raw: string | null): StoredSession | null {
    if (!raw) return null;
    try {
        const parsed = storedSessionSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function setAuthContext(event: H3Event, context: AuthContext): void {
    event.context.authUserId = context.userId;
    event.context.authSessionId = context.sessionId;
    event.context.authVersion = context.authVersion;
    event.context.authRole = context.role;
    delete event.context.authUnavailable;
}

export function getAuthContext(event: H3Event): AuthContext {
    if (event.context.authUnavailable) {
        throw createError({
            statusCode: 503,
            message: 'Authentication is temporarily unavailable'
        });
    }
    const { authUserId, authSessionId, authVersion, authRole } = event.context;
    if (
        typeof authUserId !== 'string' ||
        typeof authSessionId !== 'string' ||
        !Number.isSafeInteger(authVersion) ||
        typeof authRole !== 'string'
    ) {
        throw createError({ statusCode: 401, message: 'Authentication required' });
    }
    return { userId: authUserId, sessionId: authSessionId, authVersion, role: authRole };
}

export function getUserIdFromEvent(event: H3Event): string {
    return getAuthContext(event).userId;
}

export async function loadAuthSession(event: H3Event): Promise<void> {
    if (getCookie(event, 'auth_token')) deleteCookie(event, 'auth_token', { path: '/' });
    if (!getCookie(event, SESSION_COOKIE)) return;
    const sessionId = getCookieSessionId(event);
    if (!sessionId) {
        clearAuthCookies(event);
        return;
    }
    const stored = parseSession(
        await securityRedis(() => getRedis().get(`${SESSION_PREFIX}${sessionId}`))
    );
    if (!stored) {
        clearAuthCookies(event);
        return;
    }
    const user = await prisma.user.findUnique({
        where: { id: stored.userId },
        select: { authVersion: true, role: true }
    });
    if (!user || user.authVersion !== stored.authVersion) {
        await securityRedis(() =>
            getRedis().eval(
                "redis.call('DEL', KEYS[1]); redis.call('SREM', KEYS[2], ARGV[1]); return 1",
                2,
                `${SESSION_PREFIX}${sessionId}`,
                `${USER_SESSIONS_PREFIX}${stored.userId}`,
                sessionId
            )
        );
        clearAuthCookies(event);
        return;
    }
    setAuthContext(event, { ...stored, sessionId, role: user.role });
}

export async function lockAuthUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'auth-user:' + userId}, 0))`;
}

export async function assertAuthState(
    event: H3Event,
    state: { userId: string; sessionId: string; authVersion: number }
): Promise<void> {
    const context = getAuthContext(event);
    if (
        context.userId !== state.userId ||
        context.sessionId !== state.sessionId ||
        context.authVersion !== state.authVersion ||
        getCookieSessionId(event) !== state.sessionId
    ) {
        throw createError({
            statusCode: 401,
            message: 'Authentication state has changed',
            data: { code: 'AUTH_STATE_CHANGED' }
        });
    }
    const [raw, user] = await Promise.all([
        securityRedis(() => getRedis().get(`${SESSION_PREFIX}${state.sessionId}`)),
        prisma.user.findUnique({ where: { id: state.userId }, select: { authVersion: true } })
    ]);
    const stored = parseSession(raw);
    if (
        !user ||
        user.authVersion !== state.authVersion ||
        !stored ||
        stored.userId !== state.userId ||
        stored.authVersion !== state.authVersion
    ) {
        throw createError({
            statusCode: 401,
            message: 'Authentication state has changed',
            data: { code: 'AUTH_STATE_CHANGED' }
        });
    }
}

export async function createAuthSession(
    event: H3Event,
    userId: string,
    authVersion: number
): Promise<void> {
    const sid = randomBytes(32).toString('base64url');
    const sessionId = hashToken(sid);
    const previousId = getCookieSessionId(event);
    const previousUserId = event.context.authUserId;
    const user = await prisma.$transaction(async tx => {
        await lockAuthUser(tx, userId);
        const current = await tx.user.findUnique({
            where: { id: userId },
            select: { authVersion: true, role: true }
        });
        if (!current || current.authVersion !== authVersion) {
            throw createError({
                statusCode: 401,
                message: 'Authentication state has changed',
                data: { code: 'AUTH_STATE_CHANGED' }
            });
        }
        await securityRedis(() =>
            getRedis().eval(
                "redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]); redis.call('SADD', KEYS[2], ARGV[3]); redis.call('EXPIRE', KEYS[2], ARGV[2]); if ARGV[4] ~= '' then redis.call('DEL', KEYS[3]); redis.call('SREM', KEYS[4], ARGV[4]); end; return 1",
                4,
                `${SESSION_PREFIX}${sessionId}`,
                `${USER_SESSIONS_PREFIX}${userId}`,
                `${SESSION_PREFIX}${previousId || ''}`,
                `${USER_SESSIONS_PREFIX}${previousUserId || ''}`,
                JSON.stringify({ userId, authVersion }),
                SESSION_TTL,
                sessionId,
                previousId || ''
            )
        );
        return current;
    });
    setCookie(event, SESSION_COOKIE, sid, { ...cookieOptions(), maxAge: SESSION_TTL });
    deleteCookie(event, 'auth_token', { path: '/' });
    deleteCookie(event, 'cp_oauth_flow', cookieOptions());
    setAuthContext(event, { userId, sessionId, authVersion, role: user.role });
}

export async function logoutAuthSession(event: H3Event): Promise<void> {
    const sessionId = getCookieSessionId(event);
    if (sessionId) {
        await securityRedis(() =>
            getRedis().eval(
                "local raw = redis.call('GET', KEYS[1]); if raw then local ok, value = pcall(cjson.decode, raw); if ok and value.userId then redis.call('SREM', ARGV[1] .. value.userId, ARGV[2]); end; redis.call('DEL', KEYS[1]); end; return 1",
                1,
                `${SESSION_PREFIX}${sessionId}`,
                USER_SESSIONS_PREFIX,
                sessionId
            )
        );
    }
    clearAuthCookies(event);
    deleteCookie(event, 'cp_oauth_flow', cookieOptions());
}

export async function revokeAllUserAuthSessions(userId: string): Promise<void> {
    await securityRedis(() =>
        getRedis().eval(
            "local ids = redis.call('SMEMBERS', KEYS[1]); for _, id in ipairs(ids) do redis.call('DEL', ARGV[1] .. id); end; redis.call('DEL', KEYS[1]); return #ids",
            1,
            `${USER_SESSIONS_PREFIX}${userId}`,
            SESSION_PREFIX
        )
    );
}

export async function finishSensitiveMutation(
    event: H3Event,
    userId: string,
    authVersion: number
): Promise<void> {
    await createAuthSession(event, userId, authVersion);
    await securityRedis(() =>
        getRedis().eval(
            "local ids = redis.call('SMEMBERS', KEYS[1]); for _, id in ipairs(ids) do local raw = redis.call('GET', ARGV[1] .. id); local keep = false; if raw then local ok, value = pcall(cjson.decode, raw); keep = ok and value.authVersion == tonumber(ARGV[2]); end; if not keep then redis.call('DEL', ARGV[1] .. id); redis.call('SREM', KEYS[1], id); end; end; return 1",
            1,
            `${USER_SESSIONS_PREFIX}${userId}`,
            SESSION_PREFIX,
            authVersion
        )
    );
    deleteCookie(event, 'cp_oauth_flow', cookieOptions());
}
