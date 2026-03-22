import jwt from 'jsonwebtoken';
import type { H3Event } from 'h3';
import prisma from '~/server/utils/prisma';

export async function requireAdmin(event: H3Event): Promise<string> {
    const auth = getHeader(event, 'authorization');
    if (!auth?.startsWith('Bearer ')) {
        throw createError({ statusCode: 401, message: 'Unauthorized' });
    }
    const config = useRuntimeConfig();
    let userId: string;
    try {
        const payload = jwt.verify(auth.slice(7), config.jwtSecret) as { userId: string };
        userId = payload.userId;
    } catch {
        throw createError({ statusCode: 401, message: 'Invalid token' });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true }
    });

    if (!user || user.role !== 'admin') {
        throw createError({ statusCode: 403, message: 'Admin access required' });
    }

    return userId;
}
