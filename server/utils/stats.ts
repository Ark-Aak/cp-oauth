import prisma from '~/server/utils/prisma';
import { getRedis } from './redis';
import { createError } from 'h3';
import { z } from 'zod';
import type { SiteStatsResponse } from '~/types/api';

const OAUTH_LOGIN_REQUEST_PREFIX = 'stats:oauth-login-requests:';
const OAUTH_LOGIN_REQUEST_TTL_SECONDS = 48 * 60 * 60;
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;
const PUBLIC_STATS_TTL_SECONDS = 60;
const INCREMENT_DAY_COUNT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

const statsSchema = z.object({
    users: z.number().int().nonnegative(),
    linkedAccounts: z.number().int().nonnegative(),
    oauthClients: z.number().int().nonnegative(),
    oauthLoginRequestsToday: z.number().int().nonnegative()
});
let lastGood: { key: string; expiresAt: number; value: SiteStatsResponse } | null = null;
const inFlight = new Map<string, Promise<SiteStatsResponse>>();

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
        await redis.eval(INCREMENT_DAY_COUNT, 1, key, OAUTH_LOGIN_REQUEST_TTL_SECONDS);
    } catch {
        /* Stats are best-effort and should not block OAuth flows. */
    }
}

export async function getTodayOAuthLoginRequestCount(date = new Date()): Promise<number> {
    try {
        const raw = await getRedis().get(getOAuthLoginRequestKey(date));
        if (raw === null) return 0;
        if (!/^\d+$/.test(raw)) throw new Error('Invalid statistics count');
        const count = Number(raw);
        if (!Number.isSafeInteger(count)) throw new Error('Invalid statistics count');
        return count;
    } catch {
        throw createError({ statusCode: 503, message: 'Site statistics are unavailable' });
    }
}

export async function getPublicSiteStats(date = new Date()): Promise<SiteStatsResponse> {
    const key = `public:stats:v2:${getCstDateKey(date)}`;
    if (lastGood?.key === key && lastGood.expiresAt > Date.now()) return lastGood.value;
    const pending = inFlight.get(key);
    if (pending) return pending;
    const request = (async () => {
        try {
            const cached = await getRedis().get(key);
            if (cached) {
                const parsed = statsSchema.safeParse(JSON.parse(cached));
                if (parsed.success) {
                    const ttl = await getRedis().ttl(key);
                    if (ttl > 0) {
                        lastGood = {
                            key,
                            value: parsed.data,
                            expiresAt: Date.now() + Math.min(ttl, PUBLIC_STATS_TTL_SECONDS) * 1000
                        };
                        return parsed.data;
                    }
                }
            }
        } catch {
            // A failed data cache read may fall through to fresh DB/count reads.
        }
        let value: SiteStatsResponse;
        try {
            const [users, linkedAccounts, oauthClients, oauthLoginRequestsToday] =
                await Promise.all([
                    prisma.user.count(),
                    prisma.linkedAccount.count(),
                    prisma.oAuthClient.count(),
                    getTodayOAuthLoginRequestCount(date)
                ]);
            value = { users, linkedAccounts, oauthClients, oauthLoginRequestsToday };
        } catch {
            throw createError({ statusCode: 503, message: 'Site statistics are unavailable' });
        }
        lastGood = { key, value, expiresAt: Date.now() + PUBLIC_STATS_TTL_SECONDS * 1000 };
        try {
            await getRedis().set(key, JSON.stringify(value), 'EX', PUBLIC_STATS_TTL_SECONDS);
        } catch {
            // The current successfully read snapshot remains valid for 60 seconds.
        }
        return value;
    })();
    inFlight.set(key, request);
    try {
        return await request;
    } finally {
        inFlight.delete(key);
    }
}
