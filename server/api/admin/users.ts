import prisma from '~/server/utils/prisma';
import { requireAdmin } from '~/server/utils/admin';

export default defineEventHandler(async event => {
    await requireAdmin(event);

    if (event.method === 'GET') {
        const query = getQuery(event);
        const search = (query.search as string) || '';
        const page = Number(query.page) || 1;
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
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize
            }),
            prisma.user.count({ where })
        ]);

        return { users, total, page, pageSize };
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
