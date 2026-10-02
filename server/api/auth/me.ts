import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { createError, defineEventHandler } from 'h3';
import type { MeResponse } from '~/types/api';
import prisma from '~/server/utils/prisma';
import {
    assertAuthState,
    getAuthContext,
    getUserIdFromEvent,
    lockAuthUser
} from '~/server/utils/auth';
import { requireFreshReauthentication } from '~/server/utils/auth-completion';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { sendVerificationEmail } from '~/server/utils/mailer';
import { hashToken } from '~/server/utils/token-hash';
import { profilePatchSchema } from '~/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { parseBody } from '~/server/utils/validation';
import { getPublicBaseUrl } from '~/server/utils/base-url';

const meSelect = {
    id: true,
    email: true,
    username: true,
    displayName: true,
    bio: true,
    homepage: true,
    avatarUrl: true,
    role: true,
    emailVerified: true,
    pendingEmail: true,
    pendingEmailExpiresAt: true,
    publicLinkedPlatforms: true,
    publicCpStats: true,
    publicRatingHistory: true,
    theme: true,
    locale: true
} satisfies Prisma.UserSelect;

function toMeResponse(user: Prisma.UserGetPayload<{ select: typeof meSelect }>): MeResponse {
    return {
        ...user,
        pendingEmailExpiresAt: user.pendingEmailExpiresAt?.toISOString() ?? null,
        role: user.role as MeResponse['role'],
        publicLinkedPlatforms: user.publicLinkedPlatforms as MeResponse['publicLinkedPlatforms'],
        theme: user.theme as MeResponse['theme'],
        locale: user.locale as MeResponse['locale']
    };
}

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);

    if (event.method === 'GET') {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: meSelect });
        if (!user) throw createError({ statusCode: 404, message: 'User not found' });
        return toMeResponse(user);
    }

    if (event.method !== 'PATCH') {
        throw createError({ statusCode: 405, message: 'Method not allowed' });
    }

    const body = await parseBody(event, profilePatchSchema);
    const data: Prisma.UserUpdateInput = {};
    if (body.username !== undefined) data.username = body.username;
    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.bio !== undefined) data.bio = body.bio;
    if (body.homepage !== undefined) data.homepage = body.homepage;
    if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
    if (body.theme !== undefined) data.theme = body.theme;
    if (body.locale !== undefined) data.locale = body.locale;
    if (body.publicLinkedPlatforms !== undefined) {
        data.publicLinkedPlatforms = body.publicLinkedPlatforms;
    }
    if (body.publicCpStats !== undefined) data.publicCpStats = body.publicCpStats;
    if (body.publicRatingHistory !== undefined) data.publicRatingHistory = body.publicRatingHistory;

    const state =
        body.email === undefined
            ? getAuthContext(event)
            : await requireFreshReauthentication(event, 'email_change', body.reauthToken);
    const redirect = getSafeRedirectTarget(body.redirect);
    const baseUrl = body.email === undefined ? undefined : getPublicBaseUrl();
    const verificationToken =
        body.email === undefined ? undefined : crypto.randomBytes(32).toString('hex');
    let emailIntentCreated = false;

    const result = await prisma
        .$transaction(async tx => {
            await lockAuthUser(tx, userId);
            await assertAuthState(event, state);
            const current = await tx.user.findUnique({
                where: { id: userId },
                select: { email: true }
            });
            if (!current) throw createError({ statusCode: 404, message: 'User not found' });

            if (body.email !== undefined && body.email !== current.email) {
                await enforceRateLimit(event, 'email', body.email);
                data.pendingEmail = body.email;
                data.pendingEmailTokenHash = hashToken(verificationToken!);
                data.pendingEmailExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                emailIntentCreated = true;
            }

            return tx.user.update({ where: { id: userId }, data, select: meSelect });
        })
        .catch((error: unknown) => {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
                throw createError({ statusCode: 409, message: 'Username is already taken' });
            }
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
                throw createError({ statusCode: 404, message: 'User not found' });
            }
            throw error;
        });

    if (!emailIntentCreated) return toMeResponse(result);

    const verificationEmailSent = await sendVerificationEmail(
        body.email!,
        verificationToken!,
        baseUrl!,
        redirect
    );
    return { ...toMeResponse(result), verificationEmailSent };
});
