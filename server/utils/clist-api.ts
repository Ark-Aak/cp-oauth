import { consola } from 'consola';
import { clistFetch } from './clist-fetch';
import { getRedis } from './redis';

const logger = consola.withTag('clist-api');

const CLIST_BASE_URL = 'https://clist.by';
const CLIST_CODER_ME_URL = 'https://clist.by/api/v4/json/coder/me/';
const CLIST_STATISTICS_URL = 'https://clist.by/api/v4/json/statistics/';

// Cache TTLs (seconds)
const ACCOUNTS_CACHE_TTL = 24 * 60 * 60; // 1 day
const STATISTICS_CACHE_TTL = 24 * 60 * 60; // 1 day
const CODER_ME_CACHE_TTL = 24 * 60 * 60; // 1 day

// --- Clist resource name → local platform name ---

export const RESOURCE_TO_PLATFORM: Record<string, string> = {
    'codeforces.com': 'codeforces',
    'atcoder.jp': 'atcoder',
    'luogu.com.cn': 'luogu'
};

export const PLATFORM_TO_RESOURCE: Record<string, string> = Object.fromEntries(
    Object.entries(RESOURCE_TO_PLATFORM).map(([k, v]) => [v, k])
);

// Some resources on Clist map to the same local platform but should be shown
// separately in stats. This maps them to a distinct display name.
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
    resource_id: number;
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

interface ClistListResponse<T> {
    meta?: {
        limit?: number;
        offset?: number;
        total_count?: number;
    };
    objects?: T[];
}

// --- Fetch helpers ---

async function fetchClistJson<T>(url: string, accessToken: string): Promise<T> {
    const result = await clistFetch({
        method: 'GET',
        url,
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        sessionInit: CLIST_BASE_URL
    });

    if (result.error) {
        throw new Error(`Clist API error: ${result.error}`);
    }

    if (result.status >= 400) {
        throw new Error(`Clist API returned HTTP ${result.status}`);
    }

    const body = result.body.trim();
    if (!body || body.startsWith('<!') || body.startsWith('<html')) {
        throw new Error('Clist API returned HTML instead of JSON');
    }

    return JSON.parse(body) as T;
}

// --- Redis cache helpers ---

function cacheKey(prefix: string, accessToken: string, extra?: string): string {
    // Hash the token to avoid storing raw tokens as Redis keys
    const hash = accessToken.slice(-12);
    return extra ? `clist:${prefix}:${hash}:${extra}` : `clist:${prefix}:${hash}`;
}

async function getCached<T>(key: string): Promise<T | null> {
    try {
        const raw = await getRedis().get(key);
        if (raw) {
            logger.debug(`Cache hit: ${key}`);
            return JSON.parse(raw) as T;
        }
    } catch {
        // Redis error — skip cache
    }
    return null;
}

async function setCache(key: string, data: unknown, ttl: number): Promise<void> {
    try {
        await getRedis().set(key, JSON.stringify(data), 'EX', ttl);
    } catch {
        // Redis error — skip
    }
}

interface ClistCoderMe {
    id?: number;
    handle?: string;
    accounts?: ClistAccount[];
}

/**
 * Get the authenticated user's coder info from /coder/me/.
 */
async function fetchClistCoderMe(accessToken: string): Promise<ClistCoderMe> {
    const key = cacheKey('coder-me', accessToken);
    const cached = await getCached<ClistCoderMe>(key);
    if (cached) return cached;

    const url = `${CLIST_CODER_ME_URL}?with_accounts=true`;
    const coder = await fetchClistJson<ClistCoderMe>(url, accessToken);
    if (!coder.id) {
        throw new Error('Clist coder/me/ did not return an id');
    }
    logger.info(
        `Clist coder/me/ resolved: id=${coder.id}, handle=${coder.handle}, accounts=${(coder.accounts || []).length}`
    );
    await setCache(key, coder, CODER_ME_CACHE_TTL);
    return coder;
}

/**
 * Fetch all accounts linked to the authenticated Clist user.
 */
export async function fetchClistAccounts(accessToken: string): Promise<ClistAccount[]> {
    const key = cacheKey('accounts', accessToken);
    const cached = await getCached<ClistAccount[]>(key);
    if (cached) return cached;

    try {
        const coder = await fetchClistCoderMe(accessToken);
        const accounts = coder.accounts || [];
        logger.info(
            `Clist accounts fetched: ${accounts.length} accounts for coder id=${coder.id}, raw: ${JSON.stringify(accounts.map(a => ({ id: a.id, resource: a.resource, handle: a.handle, rating: a.rating, n_contests: a.n_contests })))}`
        );
        await setCache(key, accounts, ACCOUNTS_CACHE_TTL);
        return accounts;
    } catch (e: unknown) {
        const err = e as { message?: string };
        logger.warn(`Failed to fetch Clist accounts: ${err.message}`);
        throw e;
    }
}

/**
 * Fetch contest statistics (rating history) for the authenticated Clist user.
 */
export async function fetchClistStatistics(
    accessToken: string,
    opts?: { limit?: number }
): Promise<ClistStatistic[]> {
    const limit = opts?.limit || 200;
    const key = cacheKey('stats', accessToken, String(limit));
    const cached = await getCached<ClistStatistic[]>(key);
    if (cached) return cached;

    try {
        const coderId = (await fetchClistCoderMe(accessToken)).id!;
        const url = `${CLIST_STATISTICS_URL}?coder_id=${coderId}&limit=${limit}&new_rating__isnull=0&rating_change__isnull=0&order_by=-date&with_problems=false`;
        const data = await fetchClistJson<ClistListResponse<ClistStatistic>>(url, accessToken);
        const stats = data.objects || [];
        logger.info(
            `Clist statistics fetched: ${stats.length} entries for coder_id=${coderId}, first 3: ${JSON.stringify(stats.slice(0, 3).map(s => ({ id: s.id, event: s.event, handle: s.handle, new_rating: s.new_rating, rating_change: s.rating_change })))}`
        );
        await setCache(key, stats, STATISTICS_CACHE_TTL);
        return stats;
    } catch (e: unknown) {
        const err = e as { message?: string };
        logger.warn(`Failed to fetch Clist statistics: ${err.message}`);
        throw e;
    }
}

/**
 * Filter Clist accounts to only those whose resource matches a locally-bound platform.
 */
export function filterAccountsByBoundPlatforms(
    clistAccounts: ClistAccount[],
    boundPlatforms: string[]
): ClistAccount[] {
    const boundResources = new Set(
        boundPlatforms.map(p => PLATFORM_TO_RESOURCE[p]).filter(Boolean)
    );
    return clistAccounts.filter(account => boundResources.has(account.resource));
}

/**
 * Filter Clist statistics to only those from accounts whose resource matches a locally-bound platform.
 */
export function filterStatisticsByBoundAccounts(
    statistics: ClistStatistic[],
    validAccountIds: Set<number>
): ClistStatistic[] {
    return statistics.filter(stat => validAccountIds.has(stat.account_id));
}
