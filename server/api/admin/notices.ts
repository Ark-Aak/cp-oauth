import prisma from '~/server/utils/prisma';
import { requireAdmin } from '~/server/utils/admin';

interface CreateNoticeBody {
    title?: string;
    content?: string;
    pinned?: boolean;
}

export default defineEventHandler(async event => {
    await requireAdmin(event);

    if (event.method === 'GET') {
        const notices = await prisma.notice.findMany({
            orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
            take: 50
        });

        return { notices };
    }

    if (event.method === 'POST') {
        const body = await readBody<CreateNoticeBody>(event);
        const title = body.title?.trim() || '';
        const content = body.content?.trim() || '';

        if (!title) {
            throw createError({ statusCode: 400, message: 'Notice title is required' });
        }

        if (!content) {
            throw createError({ statusCode: 400, message: 'Notice content is required' });
        }

        if (title.length > 120) {
            throw createError({ statusCode: 400, message: 'Notice title is too long' });
        }

        const notice = await prisma.notice.create({
            data: {
                title,
                content,
                pinned: Boolean(body.pinned)
            }
        });

        return { notice };
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
