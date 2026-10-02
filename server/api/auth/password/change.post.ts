import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createError, defineEventHandler } from 'h3';
import prisma from '~/server/utils/prisma';
import { assertAuthState, finishSensitiveMutation, lockAuthUser } from '~/server/utils/auth';
import { requireFreshReauthentication } from '~/server/utils/auth-completion';
import { parseBody } from '~/server/utils/validation';
import { newPasswordSchema } from '~/utils/validation';

const passwordChangeSchema = z.strictObject({
    currentPassword: z.string().min(1).optional(),
    newPassword: newPasswordSchema,
    reauthToken: z.string().min(1).max(256).optional()
});

export default defineEventHandler(async event => {
    const body = await parseBody(event, passwordChangeSchema);
    const state = await requireFreshReauthentication(event, 'password_change', body.reauthToken);

    if (body.currentPassword !== undefined) {
        const user = await prisma.user.findUnique({
            where: { id: state.userId },
            select: { passwordHash: true }
        });
        if (!user) throw createError({ statusCode: 404, message: 'User not found' });
        if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
            throw createError({ statusCode: 401, message: 'Current password is incorrect' });
        }
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    const user = await prisma.$transaction(async tx => {
        await lockAuthUser(tx, state.userId);
        await assertAuthState(event, state);
        const updated = await tx.user.update({
            where: { id: state.userId },
            data: {
                passwordHash,
                passwordResetToken: null,
                passwordResetExpiresAt: null,
                pendingEmail: null,
                pendingEmailTokenHash: null,
                pendingEmailExpiresAt: null,
                authVersion: { increment: 1 }
            },
            select: { authVersion: true }
        });
        await tx.oAuthAuthorizationCode.deleteMany({
            where: { userId: state.userId, used: false }
        });
        await tx.oAuthAccessToken.deleteMany({ where: { userId: state.userId } });
        await tx.oAuthRefreshToken.updateMany({
            where: { userId: state.userId, revoked: false },
            data: { revoked: true }
        });
        return updated;
    });
    await finishSensitiveMutation(event, state.userId, user.authVersion);

    return { success: true };
});
