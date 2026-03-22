import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);

    if (event.method === 'GET') {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
                displayName: true,
                bio: true,
                homepage: true,
                avatarUrl: true,
                role: true,
                emailVerified: true,
                theme: true,
                locale: true
            }
        });
        if (!user) throw createError({ statusCode: 404, message: 'User not found' });
        return user;
    }

    if (event.method === 'PATCH') {
        const body = await readBody(event);
        const { displayName, bio, homepage, avatarUrl, theme, locale } = body;

        const data: Record<string, string | boolean> = {};
        if (displayName !== undefined) data.displayName = displayName;
        if (bio !== undefined) data.bio = bio;
        if (homepage !== undefined) data.homepage = homepage;
        if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
        if (theme !== undefined) data.theme = theme;
        if (locale !== undefined) data.locale = locale;

        const user = await prisma.user.update({
            where: { id: userId },
            data,
            select: {
                id: true,
                email: true,
                username: true,
                displayName: true,
                bio: true,
                homepage: true,
                avatarUrl: true,
                role: true,
                emailVerified: true,
                theme: true,
                locale: true
            }
        });
        return user;
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
