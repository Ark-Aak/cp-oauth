import { getConfig } from '~/server/utils/config';
import { getRedis } from '~/server/utils/redis';

const CACHE_KEY = 'public:config';
const CACHE_TTL = 60; // 1 minute

export default defineEventHandler(async () => {
    const redis = getRedis();

    try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) return JSON.parse(cached);
    } catch {
        // Redis unavailable
    }

    const turnstileEnabled = await getConfig('turnstile_enabled');
    const turnstileSiteKey =
        turnstileEnabled === 'true' ? await getConfig('turnstile_site_key') : '';
    const siteTitle = await getConfig('site_title');
    const registrationEnabled = await getConfig('registration_enabled');
    const homeRecentUsersCountRaw = await getConfig('home_recent_users_count');
    const codeforcesClientId = await getConfig('codeforces_client_id');
    const githubClientId = await getConfig('github_client_id');
    const googleClientId = await getConfig('google_client_id');
    const clistClientId = await getConfig('clist_client_id');

    const parsedHomeRecentUsersCount = Number.parseInt(homeRecentUsersCountRaw, 10);
    const recentUsersCount = Number.isFinite(parsedHomeRecentUsersCount)
        ? Math.min(20, Math.max(1, parsedHomeRecentUsersCount))
        : 6;

    const result = {
        siteTitle,
        registrationEnabled: registrationEnabled !== 'false',
        recentUsersCount,
        turnstileEnabled: turnstileEnabled === 'true',
        turnstileSiteKey,
        codeforcesLoginEnabled: codeforcesClientId.trim().length > 0,
        githubLoginEnabled: githubClientId.trim().length > 0,
        googleLoginEnabled: googleClientId.trim().length > 0,
        clistLoginEnabled: clistClientId.trim().length > 0
    };

    try {
        await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch {
        // Redis unavailable
    }

    return result;
});
