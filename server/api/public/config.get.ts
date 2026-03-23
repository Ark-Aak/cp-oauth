import { getConfig } from '~/server/utils/config';

export default defineEventHandler(async () => {
    const turnstileEnabled = await getConfig('turnstile_enabled');
    const turnstileSiteKey =
        turnstileEnabled === 'true' ? await getConfig('turnstile_site_key') : '';
    const siteTitle = await getConfig('site_title');
    const registrationEnabled = await getConfig('registration_enabled');
    const homeRecentUsersCountRaw = await getConfig('home_recent_users_count');
    const codeforcesClientId = await getConfig('codeforces_client_id');
    const githubClientId = await getConfig('github_client_id');
    const googleClientId = await getConfig('google_client_id');

    const parsedHomeRecentUsersCount = Number.parseInt(homeRecentUsersCountRaw, 10);
    const recentUsersCount = Number.isFinite(parsedHomeRecentUsersCount)
        ? Math.min(20, Math.max(1, parsedHomeRecentUsersCount))
        : 6;

    return {
        siteTitle,
        registrationEnabled: registrationEnabled !== 'false',
        recentUsersCount,
        turnstileEnabled: turnstileEnabled === 'true',
        turnstileSiteKey,
        codeforcesLoginEnabled: codeforcesClientId.trim().length > 0,
        githubLoginEnabled: githubClientId.trim().length > 0,
        googleLoginEnabled: googleClientId.trim().length > 0
    };
});
