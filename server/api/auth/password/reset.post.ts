import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { consola } from 'consola';
import { createError, defineEventHandler, deleteCookie } from 'h3';
import prisma from '~/server/utils/prisma';
import { lockAuthUser, revokeAllUserAuthSessions } from '~/server/utils/auth';
import { hashToken } from '~/server/utils/token-hash';
import { parseBody } from '~/server/utils/validation';
import { newPasswordSchema } from '~/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

const logger = consola.withTag('auth:password-reset');
const passwordResetSchema = z.strictObject({
    token: z.string().min(1).max(256),
    newPassword: newPasswordSchema,
    redirect: z.string().max(4096).optional()
});
const invalidResetToken = {
    statusCode: 400,
    message: 'Reset token is invalid or expired',
    data: { code: 'RESET_TOKEN_INVALID_OR_EXPIRED' }
};

export default defineEventHandler(async event => {
    const body = await parseBody(event, passwordResetSchema);
    const tokenHash = hashToken(body.token);
    const user = await prisma.user.findUnique({
        where: { passwordResetToken: tokenHash },
        select: { id: true, passwordResetExpiresAt: true }
    });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date()) {
        throw createError(invalidResetToken);
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.$transaction(async tx => {
        await lockAuthUser(tx, user.id);
        const consumed = await tx.user.updateMany({
            where: {
                id: user.id,
                passwordResetToken: tokenHash,
                passwordResetExpiresAt: { gt: new Date() }
            },
            data: {
                passwordHash,
                passwordResetToken: null,
                passwordResetExpiresAt: null,
                pendingEmail: null,
                pendingEmailTokenHash: null,
                pendingEmailExpiresAt: null,
                authVersion: { increment: 1 }
            }
        });
        if (consumed.count !== 1) throw createError(invalidResetToken);

        await tx.oAuthAuthorizationCode.deleteMany({ where: { userId: user.id, used: false } });
        await tx.oAuthAccessToken.deleteMany({ where: { userId: user.id } });
        await tx.oAuthRefreshToken.updateMany({
            where: { userId: user.id, revoked: false },
            data: { revoked: true }
        });
    });

    deleteCookie(event, 'cp_oauth_session', { path: '/' });
    deleteCookie(event, 'auth_token', { path: '/' });
    // The committed version invalidates every old session before best-effort Redis cleanup.
    void revokeAllUserAuthSessions(user.id).catch(() => {
        logger.warn('Stale authentication sessions could not be removed');
    });
    return { success: true, redirect: getSafeRedirectTarget(body.redirect) };
});
