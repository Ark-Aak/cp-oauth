import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';
import { revokeAllUserAuthSessions } from '~/server/utils/auth';
import { hashToken } from '~/server/utils/token-hash';

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const token = String(body?.token || '');
    const newPassword = String(body?.newPassword || '');

    if (!token || !newPassword) {
        throw createError({ statusCode: 400, message: 'Token and newPassword are required' });
    }

    if (newPassword.length < 8) {
        throw createError({ statusCode: 400, message: 'Password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({
        where: { passwordResetToken: hashToken(token) },
        select: { id: true, passwordResetExpiresAt: true }
    });

    if (
        !user ||
        !user.passwordResetExpiresAt ||
        user.passwordResetExpiresAt.getTime() < Date.now()
    ) {
        throw createError({ statusCode: 400, message: 'Reset token is invalid or expired' });
    }

    await revokeAllUserAuthSessions(user.id);

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
        prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: newPasswordHash,
                passwordResetToken: null,
                passwordResetExpiresAt: null
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
