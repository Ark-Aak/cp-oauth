import { consola } from 'consola';
import prisma from '~/server/utils/prisma';
import { requireAdmin } from '~/server/utils/admin';

const logger = consola.withTag('admin:users:delete');

export default defineEventHandler(async event => {
    const adminId = await requireAdmin(event);
    const id = getRouterParam(event, 'id');

    if (!id) {
        throw createError({ statusCode: 400, message: 'User ID required' });
    }

    if (id === adminId) {
        throw createError({ statusCode: 400, message: 'Cannot delete your own account' });
    }

    const target = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, username: true }
    });

    if (!target) {
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    if (target.role === 'admin') {
        const adminCount = await prisma.user.count({ where: { role: 'admin' } });
        if (adminCount <= 1) {
            throw createError({ statusCode: 400, message: 'Cannot delete the last admin' });
        }
    }

    await prisma.user.delete({ where: { id } });

    logger.info(`User deleted by admin ${adminId}: ${target.username} (${target.id})`);

    return { success: true };
});
