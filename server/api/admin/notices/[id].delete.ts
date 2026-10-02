import { createError, defineEventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { requireAdminInTransaction, rethrowAdminError } from '~/server/utils/admin';
import { getAuthContext, lockAuthUser } from '~/server/utils/auth';
import { lockAdminRole } from '~/server/utils/role';
import { getRedis } from '~/server/utils/redis';
import { parseInput } from '~/server/utils/validation';

export default defineEventHandler(async event => {
    try {
        const auth = getAuthContext(event);
        const { id } = parseInput(z.object({ id: z.string().min(1) }), {
            id: getRouterParam(event, 'id')
        });
        await prisma.$transaction(async tx => {
            await lockAdminRole(tx);
            await lockAuthUser(tx, auth.userId);
            await requireAdminInTransaction(tx, auth);
            const result = await tx.notice.deleteMany({ where: { id } });
            if (result.count !== 1)
                throw createError({ statusCode: 404, message: 'Notice not found' });
        });
        try {
            await getRedis().del('public:notices');
        } catch {
            // Cache failure does not roll back a committed deletion.
        }
        return { success: true };
    } catch (error) {
        rethrowAdminError(error, 'Notice');
    }
});
