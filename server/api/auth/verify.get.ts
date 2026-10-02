import { consola } from 'consola';
import { defineEventHandler, deleteCookie, getQuery, sendRedirect } from 'h3';
import prisma from '~/server/utils/prisma';
import { lockAuthUser, revokeAllUserAuthSessions } from '~/server/utils/auth';
import { isOAuthGeneratedLocalEmail } from '~/server/utils/email';
import { hashToken } from '~/server/utils/token-hash';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

const logger = consola.withTag('auth:verify');

export default defineEventHandler(async event => {
    const query = getQuery(event);
    const rawRedirect = Array.isArray(query.redirect) ? query.redirect[0] : query.redirect;
    const redirect = getSafeRedirectTarget(
        typeof rawRedirect === 'string' ? rawRedirect : undefined
    );
    const resultPath = (status: string) =>
        `/email-verified?${new URLSearchParams({ status, redirect })}`;
    if (typeof query.token !== 'string' || !query.token || query.token.length > 256) {
        return sendRedirect(event, resultPath('error'), 303);
    }

    const tokenHash = hashToken(query.token);
    const candidate = await prisma.user.findFirst({
        where: { OR: [{ pendingEmailTokenHash: tokenHash }, { emailVerifyToken: tokenHash }] },
        select: { id: true }
    });
    if (!candidate) return sendRedirect(event, resultPath('error'), 303);

    const result = await prisma
        .$transaction(async tx => {
            await lockAuthUser(tx, candidate.id);
            const user = await tx.user.findUnique({
                where: { id: candidate.id },
                select: {
                    email: true,
                    emailVerifyToken: true,
                    emailVerifyExpiresAt: true,
                    pendingEmail: true,
                    pendingEmailTokenHash: true,
                    pendingEmailExpiresAt: true
                }
            });
            if (!user) return { status: 'error' as const };

            const now = new Date();
            if (user.pendingEmailTokenHash === tokenHash) {
                if (!user.pendingEmail || isOAuthGeneratedLocalEmail(user.pendingEmail)) {
                    return { status: 'error' as const };
                }
                if (!user.pendingEmailExpiresAt || user.pendingEmailExpiresAt <= now) {
                    return { status: 'expired' as const };
                }
                // The email uniqueness constraint is the final arbiter; pending intents do not reserve it.
                const consumed = await tx.user.updateMany({
                    where: {
                        id: candidate.id,
                        pendingEmail: user.pendingEmail,
                        pendingEmailTokenHash: tokenHash,
                        pendingEmailExpiresAt: { gt: now }
                    },
                    data: {
                        email: user.pendingEmail,
                        emailVerified: true,
                        pendingEmail: null,
                        pendingEmailTokenHash: null,
                        pendingEmailExpiresAt: null,
                        emailVerifyToken: null,
                        emailVerifyExpiresAt: null,
                        passwordResetToken: null,
                        passwordResetExpiresAt: null,
                        authVersion: { increment: 1 }
                    }
                });
                return consumed.count === 1
                    ? { status: 'success' as const, userId: candidate.id }
                    : { status: 'error' as const };
            }

            if (user.emailVerifyToken !== tokenHash || isOAuthGeneratedLocalEmail(user.email)) {
                return { status: 'error' as const };
            }
            if (!user.emailVerifyExpiresAt || user.emailVerifyExpiresAt <= now) {
                return { status: 'expired' as const };
            }
            const consumed = await tx.user.updateMany({
                where: {
                    id: candidate.id,
                    email: user.email,
                    emailVerifyToken: tokenHash,
                    emailVerifyExpiresAt: { gt: now }
                },
                data: {
                    emailVerified: true,
                    emailVerifyToken: null,
                    emailVerifyExpiresAt: null,
                    passwordResetToken: null,
                    passwordResetExpiresAt: null,
                    authVersion: { increment: 1 }
                }
            });
            return consumed.count === 1
                ? { status: 'success' as const, userId: candidate.id }
                : { status: 'error' as const };
        })
        .catch((error: unknown) => {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
                return { status: 'conflict' as const };
            }
            throw error;
        });

    if (result.status === 'success') {
        deleteCookie(event, 'cp_oauth_session', { path: '/' });
        deleteCookie(event, 'auth_token', { path: '/' });
        // authVersion is the revocation barrier even when Redis cleanup is unavailable.
        void revokeAllUserAuthSessions(result.userId).catch(() => {
            logger.warn('Stale authentication sessions could not be removed');
        });
    }
    return sendRedirect(event, resultPath(result.status), 303);
});
