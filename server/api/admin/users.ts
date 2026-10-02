import { createError, defineEventHandler } from 'h3';
import prisma from '~/server/utils/prisma';
import { requireAdmin, rethrowAdminError } from '~/server/utils/admin';
import { parseQuery } from '~/server/utils/validation';
import { adminUsersQuerySchema } from '~/utils/admin-validation';
export default defineEventHandler(async event => {
    try {
        await requireAdmin(event);
        if (event.method !== 'GET') {
            throw createError({ statusCode: 405, message: 'Method not allowed' });
        }
        const { search, page } = parseQuery(event, adminUsersQuerySchema);
        const pageSize = 20;
        const where = search
            ? {
                  OR: [
                      { username: { contains: search, mode: 'insensitive' as const } },
                      { email: { contains: search, mode: 'insensitive' as const } }
                  ]
              }
            : {};

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    username: true,
                    displayName: true,
                    role: true,
                    emailVerified: true,
                    createdAt: true
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize
            }),
            prisma.user.count({ where })
        ]);

        return { users, total, page, pageSize };
    } catch (error) {
        rethrowAdminError(error, 'User');
    }
});
