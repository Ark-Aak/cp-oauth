import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);

    const [user, passkeyCount] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                twoFactorEnabled: true,
                twoFactorMethod: true,
                emailVerified: true
            }
        }),
        prisma.passkeyCredential.count({ where: { userId } })
    ]);

    if (!user) {
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    return {
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorMethod: user.twoFactorMethod,
        hasEmail: user.emailVerified,
        passkeyCount
    };
});
