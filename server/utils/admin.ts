import type { H3Event } from 'h3';
import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';

export async function requireAdmin(event: H3Event): Promise<string> {
    const userId = getUserIdFromEvent(event);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true }
    });

    if (!user || user.role !== 'admin') {
        throw createError({ statusCode: 403, message: 'Admin access required' });
    }

    return userId;
}
