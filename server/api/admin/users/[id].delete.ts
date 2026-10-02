import { createError, defineEventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import {
    requireAdminInTransaction,
    requireAnotherAdmin,
    rethrowAdminError
} from '~/server/utils/admin';
import { clearAuthCookies, getAuthContext, lockAuthUser } from '~/server/utils/auth';
import { lockAdminRole } from '~/server/utils/role';
import { parseInput } from '~/server/utils/validation';

export default defineEventHandler(async event => {
    try {
        const auth = getAuthContext(event);
        const { id } = parseInput(z.object({ id: z.string().min(1) }), {
            id: getRouterParam(event, 'id')
        });

        await prisma.$transaction(async tx => {
            await lockAdminRole(tx);
            for (const userId of [...new Set([auth.userId, id])].sort()) {
                await lockAuthUser(tx, userId);
            }
            await requireAdminInTransaction(tx, auth);
            const target = await tx.user.findUnique({
                where: { id },
                select: { role: true }
            });
            if (!target) throw createError({ statusCode: 404, message: 'User not found' });
            if (target.role === 'admin') await requireAnotherAdmin(tx);
            await tx.user.delete({ where: { id } });
        });

        if (id === auth.userId) clearAuthCookies(event);
        return { success: true };
    } catch (error) {
        rethrowAdminError(error, 'User');
    }
});
