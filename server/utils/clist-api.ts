import { consola } from 'consola';
import { createError } from 'h3';
import { z } from 'zod';
import { clistFetch } from './clist-fetch';
import { getRedis } from './redis';
import { hashToken } from './token-hash';

const logger = consola.withTag('clist-api');

const CLIST_BASE_URL = 'https://clist.by';
const CLIST_CODER_ME_URL = 'https://clist.by/api/v4/json/coder/me/';
const CLIST_STATISTICS_URL = 'https://clist.by/api/v4/json/statistics/';

// Cache TTLs (seconds)
const ACCOUNTS_CACHE_TTL = 24 * 60 * 60; // 1 day
const STATISTICS_CACHE_TTL = 24 * 60 * 60; // 1 day
const CODER_ME_CACHE_TTL = 24 * 60 * 60; // 1 day

export const RESOURCE_DISPLAY_NAMES: Record<string, string> = {
    'codeforces.com': 'Codeforces',
    'atcoder.jp': 'AtCoder',
    'luogu.com.cn': 'Luogu',
    'leetcode.com': 'LeetCode',
    'codechef.com': 'CodeChef',
    'topcoder.com': 'TopCoder',
    'hackerrank.com': 'HackerRank',
    'hackerearth.com': 'HackerEarth',
    'codingcompetitions.withgoogle.com': 'Google Contests',
    'dmoj.ca': 'DMOJ',
    'acm.timus.ru': 'Timus OJ',
    'judge.yosupo.jp': 'Library Checker',
    'yukicoder.me': 'yukicoder',
    'naukri.com/code360': 'Coding Ninjas',
    'open.kattis.com': 'Kattis',
    'usaco.org': 'USACO',
    'acmp.ru': 'ACMP',
    'projecteuler.net': 'Project Euler',
    'spoj.com': 'SPOJ',
    'uoj.ac': 'UOJ',
    'loj.ac': 'LOJ',
    'qoj.ac': 'QOJ',
    'nkoj.vn': 'NKOJ'
};

export function getResourceDisplayName(resource: string): string {
    return RESOURCE_DISPLAY_NAMES[resource] || resource;
}

const ATCODER_HEURISTIC_PATTERN = /atcoder heuristic contest/i;

/**
 * Determine effective resource key for a statistic entry.
 * AtCoder Heuristic Contests are split from regular AtCoder.
 */
export function getEffectiveResource(stat: { resource?: string; event: string }): string {
    const resource = stat.resource || '';
    if (resource === 'atcoder.jp' && ATCODER_HEURISTIC_PATTERN.test(stat.event)) {
        return 'atcoder.jp/heuristic';
    }
    return resource;
}

/**
 * Get display name, including the synthetic AtCoder Heuristic resource.
 */
export function getEffectiveResourceDisplayName(effectiveResource: string): string {
    if (effectiveResource === 'atcoder.jp/heuristic') {
        return 'AtCoder Heuristic';
    }
    return RESOURCE_DISPLAY_NAMES[effectiveResource] || effectiveResource;
}

// --- Types ---

export interface ClistAccount {
    id: number;
    resource: string;
    resource_id?: number;
    handle: string;
    name: string | null;
    rating: number | null;
    n_contests: number;
    resource_rank: number | null;
    last_activity: string | null;
}

export interface ClistStatistic {
    id: number;
    account_id: number;
    handle: string;
    contest_id: number;
    event: string;
    date: string;
    place: number | null;
    score: number | null;
    new_rating: number | null;
    old_rating: number | null;
    rating_change: number | null;
}

// --- Fetch helpers ---

async function fetchClistJson<T extends z.ZodType>(
    url: string,
    accessToken: string,
    schema: T
): Promise<z.output<T>> {
    const result = await clistFetch({
        method: 'GET',
        url,
        headers: { Authorization: `Bearer ${accessToken}` },
        sessionInit: CLIST_BASE_URL
    });
    if (result.error || result.status < 200 || result.status >= 300) {
        logger.warn(
            result.error
                ? `Clist request failed: ${result.error}`
                : `Clist HTTP response: ${Math.floor(result.status / 100)}xx`
        );
        throw createError({
            statusCode: result.error === 'timeout' ? 504 : 502,
            message: 'Clist data is unavailable'
        });
    }
    let value: unknown;
    try {
        value = JSON.parse(result.body);
    } catch {
        throw createError({ statusCode: 502, message: 'Invalid Clist response' });
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw createError({ statusCode: 502, message: 'Invalid Clist response' });
    }
    return parsed.data;
}

const accountSchema = z.object({
    id: z.number().int().positive(),
    resource: z.string().min(1),
    resource_id: z.number().int().optional(),
    handle: z.string().min(1),
    name: z.string().nullable().optional().default(null),
    rating: z.number().finite().nullable().optional().default(null),
    n_contests: z.number().int().nonnegative(),
    resource_rank: z.number().int().nullable().optional().default(null),
    last_activity: z.string().nullable().optional().default(null)
});
const statisticSchema = z.object({
    id: z.number().int().positive(),
    account_id: z.number().int().positive(),
    handle: z.string(),
    contest_id: z.number().int().positive(),
    event: z.string(),
    date: z.string().refine(value => Number.isFinite(Date.parse(value))),
    place: z.number().nullable(),
    score: z.number().nullable().optional().default(null),
    new_rating: z.number().finite().nullable(),
    old_rating: z.number().finite().nullable().optional().default(null),
    rating_change: z.number().finite().nullable()
});
const coderSchema = z.object({
    id: z.number().int().positive(),
    accounts: z.array(accountSchema)
});

const inFlight = new Map<string, Promise<unknown>>();

async function cachedClist<T extends z.ZodType>(
    key: string,
    ttl: number,
    schema: T,
    load: () => Promise<z.output<T>>
): Promise<z.output<T>> {
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<z.output<T>>;
    const request = (async () => {
        try {
            const raw = await getRedis().get(key);
            if (raw) {
                const cached = schema.safeParse(JSON.parse(raw));
                if (cached.success) return cached.data;
            }
        } catch {
            // Data cache outages do not turn a provider success into a failure.
        }
        const data = await load();
        try {
            await getRedis().set(key, JSON.stringify(data), 'EX', ttl);
        } catch {
            // Skip the cache when Redis is unavailable.
        }
        return data;
    })();
    inFlight.set(key, request);
    try {
        return await request;
    } finally {
        inFlight.delete(key);
    }
}

function cacheKey(prefix: string, accessToken: string, extra?: string): string {
    const key = `clist:v2:${prefix}:${hashToken(accessToken)}`;
    return extra ? `${key}:${extra}` : key;
}

async function fetchClistCoderMe(accessToken: string): Promise<z.output<typeof coderSchema>> {
    return cachedClist(cacheKey('coder-me', accessToken), CODER_ME_CACHE_TTL, coderSchema, () =>
        fetchClistJson(`${CLIST_CODER_ME_URL}?with_accounts=true`, accessToken, coderSchema)
    );
}

export async function fetchClistAccounts(accessToken: string): Promise<ClistAccount[]> {
    return cachedClist(
        cacheKey('accounts', accessToken),
        ACCOUNTS_CACHE_TTL,
        z.array(accountSchema),
        async () => {
            const { accounts } = await fetchClistCoderMe(accessToken);
            logger.info(`Clist accounts fetched: ${accounts.length}`);
            return accounts;
        }
    );
}

export async function fetchClistStatistics(
    accessToken: string,
    opts?: { limit?: number }
): Promise<ClistStatistic[]> {
    const limit = opts?.limit ?? 200;
    return cachedClist(
        cacheKey('stats', accessToken, String(limit)),
        STATISTICS_CACHE_TTL,
        z.array(statisticSchema),
        async () => {
            const { id } = await fetchClistCoderMe(accessToken);
            const url = `${CLIST_STATISTICS_URL}?coder_id=${id}&limit=${limit}&new_rating__isnull=0&rating_change__isnull=0&order_by=-date&with_problems=false`;
            const data = await fetchClistJson(
                url,
                accessToken,
                z.object({ objects: z.array(statisticSchema) })
            );
            logger.info(`Clist statistics fetched: ${data.objects.length}`);
            return data.objects;
        }
    );
}

export interface BoundIdentity {
    platform: string;
    platformUid: string;
    platformUsername: string | null;
}

function canonicalDecimal(value: string): string | null {
    return /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, '') : null;
}

export function isMatchableBoundIdentity(binding: BoundIdentity): boolean {
    return (
        (binding.platform === 'codeforces' && Boolean(binding.platformUsername)) ||
        (binding.platform === 'atcoder' && Boolean(binding.platformUid)) ||
        (binding.platform === 'luogu' && canonicalDecimal(binding.platformUid) !== null)
    );
}

/** Only verifiable identities on the exact supported resource may be disclosed. */
export function filterAccountsByBoundIdentities(
    accounts: ClistAccount[],
    bindings: BoundIdentity[]
): ClistAccount[] {
    const handles: Record<string, Set<string>> = {
        'codeforces.com': new Set(),
        'atcoder.jp': new Set(),
        'luogu.com.cn': new Set()
    };
    for (const binding of bindings) {
        if (binding.platform === 'codeforces' && binding.platformUsername) {
            handles['codeforces.com']!.add(binding.platformUsername.toLowerCase());
        } else if (binding.platform === 'atcoder' && binding.platformUid) {
            handles['atcoder.jp']!.add(binding.platformUid.toLowerCase());
        } else if (binding.platform === 'luogu') {
            const uid = canonicalDecimal(binding.platformUid);
            if (uid !== null) handles['luogu.com.cn']!.add(uid);
        }
    }
    return accounts.filter(account => {
        if (!Object.hasOwn(handles, account.resource)) return false;
        const handle =
            account.resource === 'luogu.com.cn'
                ? canonicalDecimal(account.handle)
                : account.handle.toLowerCase();
        return handle !== null && handles[account.resource]!.has(handle);
    });
}

/**
 * Filter statistics by the IDs of identity-matched accounts.
 */
export function filterStatisticsByBoundAccounts(
    statistics: ClistStatistic[],
    validAccountIds: Set<number>
): ClistStatistic[] {
    return statistics.filter(stat => validAccountIds.has(stat.account_id));
}
