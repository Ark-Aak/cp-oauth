import jwt from 'jsonwebtoken';
import { buildAuthSessionKey } from '~/server/utils/auth';
import { getRedis } from '~/server/utils/redis';

const SESSION_OPTIONAL_PATH_PREFIXES = ['/api/oauth/userinfo'];

export default defineEventHandler(async event => {
    const auth = getHeader(event, 'authorization');
    if (!auth?.startsWith('Bearer ')) {
        return;
    }
    if (SESSION_OPTIONAL_PATH_PREFIXES.some(path => event.path.startsWith(path))) {
        return;
    }

    const token = auth.slice(7);
    const config = useRuntimeConfig();

    let payload: { userId?: unknown; sid?: unknown };
    try {
        payload = jwt.verify(token, config.jwtSecret) as { userId?: unknown; sid?: unknown };
    } catch {
        throw createError({ statusCode: 401, message: 'Invalid token' });
    }

    if (typeof payload.sid !== 'string' || typeof payload.userId !== 'string') {
        throw createError({ statusCode: 401, message: 'Invalid token' });
    }

    const sessionUserId = await getRedis().get(buildAuthSessionKey(payload.sid));
    if (sessionUserId !== payload.userId) {
        throw createError({ statusCode: 401, message: 'Invalid token' });
    }

    event.context.authUserId = payload.userId;
});
