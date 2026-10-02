import { createError, defineEventHandler } from 'h3';
import prisma from '~/server/utils/prisma';
import { requireAdmin, requireAdminInTransaction, rethrowAdminError } from '~/server/utils/admin';
import { getAuthContext, lockAuthUser } from '~/server/utils/auth';
import { lockAdminRole } from '~/server/utils/role';
import { getRedis } from '~/server/utils/redis';
import { parseBody } from '~/server/utils/validation';
import { showcaseCreateSchema } from '~/utils/admin-validation';
import { httpUrlSchema } from '~/utils/validation';

export default defineEventHandler(async event => {
    try {
        if (event.method === 'GET') {
            await requireAdmin(event);
            const rows = await prisma.showcaseItem.findMany({
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]
            });
            const items = rows.map(item => {
                const url = httpUrlSchema.safeParse(item.url).success ? item.url : null;
                const iconUrl =
                    item.iconUrl && httpUrlSchema.safeParse(item.iconUrl).success
                        ? item.iconUrl
                        : null;
                const invalidUrls: ('url' | 'iconUrl')[] = [];
                if (!url) invalidUrls.push('url');
                if (item.iconUrl && !iconUrl) invalidUrls.push('iconUrl');
                return { ...item, url, iconUrl, invalidUrls };
            });
            return { items };
        }

        if (event.method === 'POST') {
            const auth = getAuthContext(event);
            const body = await parseBody(event, showcaseCreateSchema);
            const item = await prisma.$transaction(async tx => {
                await lockAdminRole(tx);
                await lockAuthUser(tx, auth.userId);
                await requireAdminInTransaction(tx, auth);
                return tx.showcaseItem.create({ data: body });
            });
            try {
                await getRedis().del('public:showcase');
            } catch {
                // Cache failure does not roll back a committed showcase item.
            }
            return { item };
        }

        throw createError({ statusCode: 405, message: 'Method not allowed' });
    } catch (error) {
        rethrowAdminError(error, 'Showcase item');
    }
});
