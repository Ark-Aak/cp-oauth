import { createError, defineEventHandler } from 'h3';
import prisma from '~/server/utils/prisma';
import { requireAdmin, requireAdminInTransaction, rethrowAdminError } from '~/server/utils/admin';
import { getAuthContext, lockAuthUser } from '~/server/utils/auth';
import { lockAdminRole } from '~/server/utils/role';
import { getRedis } from '~/server/utils/redis';
import { sanitizeNoticeContent } from '~/server/utils/notices';
import { parseBody } from '~/server/utils/validation';
import { noticeCreateSchema } from '~/utils/admin-validation';

export default defineEventHandler(async event => {
    try {
        if (event.method === 'GET') {
            await requireAdmin(event);
            const notices = await prisma.notice.findMany({
                orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
                take: 50
            });
            return {
                notices: notices.map(notice => ({
                    ...notice,
                    content: sanitizeNoticeContent(notice.content)
                }))
            };
        }

        if (event.method === 'POST') {
            const auth = getAuthContext(event);
            const body = await parseBody(event, noticeCreateSchema);
            const content = sanitizeNoticeContent(body.content);
            const notice = await prisma.$transaction(async tx => {
                await lockAdminRole(tx);
                await lockAuthUser(tx, auth.userId);
                await requireAdminInTransaction(tx, auth);
                return tx.notice.create({ data: { ...body, content } });
            });
            try {
                await getRedis().del('public:notices');
            } catch {
                // Cache failure does not roll back a committed notice.
            }
            return { notice };
        }

        throw createError({ statusCode: 405, message: 'Method not allowed' });
    } catch (error) {
        rethrowAdminError(error, 'Notice');
    }
});
