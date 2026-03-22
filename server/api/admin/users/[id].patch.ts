import prisma from '~/server/utils/prisma';
import { requireAdmin } from '~/server/utils/admin';

export default defineEventHandler(async event => {
    const adminId = await requireAdmin(event);
    const id = getRouterParam(event, 'id');

    if (!id) throw createError({ statusCode: 400, message: 'User ID required' });

    if (event.method === 'PATCH') {
        const body = await readBody(event);
        const data: Record<string, string | boolean> = {};

        if (body.role !== undefined) {
            if (id === adminId) {
                throw createError({ statusCode: 400, message: 'Cannot change your own role' });
            }
            data.role = body.role;
        }
        if (body.emailVerified !== undefined) data.emailVerified = body.emailVerified;

        const user = await prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                email: true,
                username: true,
                displayName: true,
                role: true,
                emailVerified: true,
                createdAt: true
            }
        });
        return user;
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
