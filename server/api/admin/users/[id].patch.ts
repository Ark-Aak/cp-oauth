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
import { parseBody, parseInput } from '~/server/utils/validation';
import { adminUserPatchSchema } from '~/utils/admin-validation';

export default defineEventHandler(async event => {
    try {
        const auth = getAuthContext(event);
        const { id } = parseInput(z.object({ id: z.string().min(1) }), {
            id: getRouterParam(event, 'id')
        });
        const data = await parseBody(event, adminUserPatchSchema);

        const result = await prisma.$transaction(async tx => {
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
            const roleChanged = data.role !== undefined && data.role !== target.role;
            if (target.role === 'admin' && data.role === 'user') {
                await requireAnotherAdmin(tx);
            }
            const user = await tx.user.update({
                where: { id },
                data: { ...data, ...(roleChanged ? { authVersion: { increment: 1 } } : {}) },
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
            return { user, roleChanged };
        });

        if (result.roleChanged && id === auth.userId) clearAuthCookies(event);
        return result.user;
    } catch (error) {
        rethrowAdminError(error, 'User');
    }
});
