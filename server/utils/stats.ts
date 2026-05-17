import prisma from '~/server/utils/prisma';
import { getRedis } from './redis';

const OAUTH_LOGIN_REQUEST_PREFIX = 'stats:oauth-login-requests:';
const OAUTH_LOGIN_REQUEST_TTL_SECONDS = 90 * 24 * 60 * 60;
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

function getCstDateKey(date = new Date()): string {
    return new Date(date.getTime() + CST_OFFSET_MS).toISOString().slice(0, 10);
}

function getOAuthLoginRequestKey(date = new Date()): string {
    return `${OAUTH_LOGIN_REQUEST_PREFIX}${getCstDateKey(date)}`;
}

export async function incrementOAuthLoginRequestCount(date = new Date()): Promise<void> {
    const redis = getRedis();
    const key = getOAuthLoginRequestKey(date);

    try {
        await redis.multi().incr(key).expire(key, OAUTH_LOGIN_REQUEST_TTL_SECONDS).exec();
    } catch {
        /* Stats are best-effort and should not block OAuth flows. */
    }
}

export async function getTodayOAuthLoginRequestCount(date = new Date()): Promise<number> {
    try {
        const raw = await getRedis().get(getOAuthLoginRequestKey(date));
        const count = Number.parseInt(raw || '0', 10);
        return Number.isFinite(count) ? count : 0;
    } catch {
        return 0;
    }
}

export async function getPublicSiteStats() {
    const [users, linkedAccounts, oauthClients, oauthLoginRequestsToday] = await Promise.all([
        prisma.user.count(),
        prisma.linkedAccount.count(),
        prisma.oAuthClient.count(),
        getTodayOAuthLoginRequestCount()
    ]);

    return {
        users,
        linkedAccounts,
        oauthClients,
        oauthLoginRequestsToday
    };
}
