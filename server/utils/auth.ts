import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { H3Event } from 'h3';
import { getRedis } from '~/server/utils/redis';

const AUTH_TOKEN_EXPIRES_IN = '7d';
const AUTH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function buildAuthSessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
}

function buildUserSessionsKey(userId: string): string {
    return `auth:user-sessions:${userId}`;
}

export async function signAuthToken(userId: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    const redis = getRedis();
    const userSessionsKey = buildUserSessionsKey(userId);
    await redis
        .multi()
        .set(buildAuthSessionKey(sessionId), userId, 'EX', AUTH_TOKEN_TTL_SECONDS)
        .sadd(userSessionsKey, sessionId)
        .expire(userSessionsKey, AUTH_TOKEN_TTL_SECONDS)
        .exec();

    const config = useRuntimeConfig();
    return jwt.sign({ userId, sid: sessionId }, config.jwtSecret, {
        expiresIn: AUTH_TOKEN_EXPIRES_IN
    });
}

export async function revokeAllUserAuthSessions(userId: string): Promise<void> {
    const redis = getRedis();
    const userSessionsKey = buildUserSessionsKey(userId);
    const sessionIds = await redis.smembers(userSessionsKey);

    const pipeline = redis.multi();
    if (sessionIds.length > 0) {
        pipeline.del(...sessionIds.map(buildAuthSessionKey));
    }
    pipeline.del(userSessionsKey);
    await pipeline.exec();
}

export function getUserIdFromEvent(event: H3Event): string {
    const userId = (event.context as { authUserId?: unknown }).authUserId;
    if (typeof userId === 'string' && userId.length > 0) {
        return userId;
    }

    const authHeader = getHeader(event, 'authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    throw createError({ statusCode: 401, message: 'Invalid token' });
}
