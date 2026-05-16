import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';
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

    await prisma.user.update({
        where: { id: user.id },
        data: {
            passwordHash: await bcrypt.hash(newPassword, 10),
            passwordResetToken: null,
            passwordResetExpiresAt: null
        }
    });

    return { success: true };
});
