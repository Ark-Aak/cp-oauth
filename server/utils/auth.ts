import jwt from 'jsonwebtoken';
import type { H3Event } from 'h3';

export function getUserIdFromEvent(event: H3Event): string {
    const auth = getHeader(event, 'authorization');
    if (!auth?.startsWith('Bearer ')) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }
    const config = useRuntimeConfig();
    try {
        const payload = jwt.verify(auth.slice(7), config.jwtSecret) as { userId: string };
        return payload.userId;
    } catch {
        throw createError({ statusCode: 401, message: 'Invalid token' });
    }
}
