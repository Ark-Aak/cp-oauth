import jwt from 'jsonwebtoken';
import prisma from '~/server/utils/prisma';
import type { ScopeName } from '~/server/utils/oauth';

interface OAuthPayload {
    sub: string;
    client_id: string;
    scopes: string[];
    type: string;
}

export default defineEventHandler(async event => {
    const auth = getHeader(event, 'authorization');
    if (!auth?.startsWith('Bearer ')) {
        throw createError({ statusCode: 401, message: 'Bearer token required' });
    }

    const token = auth.slice(7);
    const config = useRuntimeConfig();

    let payload: OAuthPayload;
    try {
        payload = jwt.verify(token, config.jwtSecret) as OAuthPayload;
    } catch {
        throw createError({ statusCode: 401, message: 'Invalid or expired token' });
    }

    if (payload.type !== 'oauth_access') {
        throw createError({ statusCode: 401, message: 'Invalid token type' });
    }

    // Verify token still exists in DB (not revoked)
    const storedToken = await prisma.oAuthAccessToken.findUnique({ where: { token } });
    if (!storedToken || storedToken.expiresAt < new Date()) {
        throw createError({ statusCode: 401, message: 'Token expired or revoked' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    const scopes = payload.scopes as ScopeName[];
    const response: Record<string, unknown> = {};

    // openid — always include sub
    if (scopes.includes('openid')) {
        response.sub = user.id;
    }

    // profile — username, avatar, bio, displayName
    if (scopes.includes('profile')) {
        response.username = user.username;
        response.display_name = user.displayName;
        response.avatar_url = user.avatarUrl;
        response.bio = user.bio;
    }

    // email — email address and verification status
    if (scopes.includes('email')) {
        response.email = user.email;
        response.email_verified = user.emailVerified;
    }

    // cp:linked — linked platform accounts
    if (scopes.includes('cp:linked')) {
        const linked = await prisma.linkedAccount.findMany({
            where: { userId: user.id },
            select: {
                platform: true,
                platformUid: true,
                platformUsername: true
            }
        });
        response.linked_accounts = linked;
    }

    // cp:summary — placeholder for aggregated CP stats
    if (scopes.includes('cp:summary')) {
        response.cp_summary = {
            linked_accounts: [],
            total_solved: 0,
            highest_rating: null,
            note: 'Linked CP account data coming soon'
        };
    }

    // cp:details — placeholder for full submission/rating data
    if (scopes.includes('cp:details')) {
        response.cp_details = {
            submissions: [],
            rating_history: [],
            note: 'Detailed CP data coming soon'
        };
    }

    return response;
});
