import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { sendVerificationEmail } from '~/server/utils/mailer';
import crypto from 'crypto';
import { USERNAME_RULE_MESSAGE, isValidUsername, normalizeUsername } from '~/utils/username';

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getBaseUrl(event: Parameters<typeof getRequestURL>[0]): string {
    const host = getHeader(event, 'host') || 'localhost:3000';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
}

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const allowedPublicPlatforms = new Set([
        'luogu',
        'atcoder',
        'codeforces',
        'github',
        'google',
        'clist'
    ]);

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
                publicLinkedPlatforms: true,
                publicLinkedPlatformsConfigured: true,
                publicCpStats: true,
                publicRatingHistory: true,
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

        const data: Record<string, unknown> = {};
        if (body.username !== undefined) {
            const username = normalizeUsername(body.username);
            if (!isValidUsername(username)) {
                throw createError({
                    statusCode: 400,
                    message: USERNAME_RULE_MESSAGE
                });
            }

            const existing = await prisma.user.findFirst({
                where: {
                    username: { equals: username, mode: 'insensitive' },
                    id: { not: userId }
                },
                select: { id: true }
            });
            if (existing) {
                throw createError({ statusCode: 409, message: 'Username is already taken' });
            }

            data.username = username;
        }
        if (displayName !== undefined) data.displayName = displayName;
        if (bio !== undefined) data.bio = bio;
        if (homepage !== undefined) data.homepage = homepage;
        if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
        if (body.email !== undefined) {
            const email = String(body.email).trim().toLowerCase();
            if (!isValidEmail(email)) {
                throw createError({ statusCode: 400, message: 'Invalid email format' });
            }

            const existing = await prisma.user.findFirst({
                where: {
                    email,
                    id: { not: userId }
                },
                select: { id: true }
            });
            if (existing) {
                throw createError({ statusCode: 409, message: 'Email is already taken' });
            }

            const current = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true }
            });
            if (!current) {
                throw createError({ statusCode: 404, message: 'User not found' });
            }

            if (current.email !== email) {
                const emailVerifyToken = crypto.randomBytes(32).toString('hex');
                data.email = email;
                data.emailVerified = false;
                data.emailVerifyToken = emailVerifyToken;
                const sent = await sendVerificationEmail(
                    email,
                    emailVerifyToken,
                    getBaseUrl(event)
                );
                if (!sent) {
                    throw createError({ statusCode: 503, message: 'SMTP is not configured' });
                }
            }
        }
        if (theme !== undefined) data.theme = theme;
        if (locale !== undefined) data.locale = locale;
        if (body.publicLinkedPlatforms !== undefined) {
            if (!Array.isArray(body.publicLinkedPlatforms)) {
                throw createError({
                    statusCode: 400,
                    message: 'publicLinkedPlatforms must be an array'
                });
            }
            const normalized = Array.from(
                new Set(
                    body.publicLinkedPlatforms
                        .map((item: unknown) => String(item).trim().toLowerCase())
                        .filter((item: string) => allowedPublicPlatforms.has(item))
                )
            );
            data.publicLinkedPlatforms = normalized;
            data.publicLinkedPlatformsConfigured = true;
        }
        if (body.publicCpStats !== undefined) {
            data.publicCpStats = Boolean(body.publicCpStats);
        }
        if (body.publicRatingHistory !== undefined) {
            data.publicRatingHistory = Boolean(body.publicRatingHistory);
        }

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
                publicLinkedPlatforms: true,
                publicLinkedPlatformsConfigured: true,
                publicCpStats: true,
                publicRatingHistory: true,
                theme: true,
                locale: true
            }
        });
        return user;
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
