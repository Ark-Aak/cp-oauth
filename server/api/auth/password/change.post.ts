import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent, revokeAllUserAuthSessions } from '~/server/utils/auth';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const body = await readBody(event);
    const currentPassword = String(body?.currentPassword || '');
    const newPassword = String(body?.newPassword || '');

    if (!currentPassword || !newPassword) {
        throw createError({
            statusCode: 400,
            message: 'Current password and new password are required'
        });
    }

    if (newPassword.length < 8) {
        throw createError({ statusCode: 400, message: 'Password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true }
    });

    if (!user) {
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
        throw createError({ statusCode: 401, message: 'Current password is incorrect' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
        prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: newPasswordHash
            }
        }),
        prisma.oAuthAccessToken.deleteMany({
            where: { userId: user.id }
        }),
        prisma.oAuthRefreshToken.updateMany({
            where: { userId: user.id, revoked: false },
            data: { revoked: true }
        })
    ]);
    await revokeAllUserAuthSessions(user.id);

    return { success: true };
});
