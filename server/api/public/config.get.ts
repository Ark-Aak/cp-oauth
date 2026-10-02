import { getConfig } from '~/server/utils/config';

export default defineEventHandler(async event => {
    setResponseHeader(event, 'Cache-Control', 'no-store');
    const config = await getConfig([
        'site_title',
        'registration_enabled',
        'home_recent_users_count',
        'turnstile_enabled',
        'turnstile_site_key',
        'turnstile_secret_key',
        'codeforces_client_id',
        'codeforces_client_secret',
        'github_client_id',
        'github_client_secret',
        'google_client_id',
        'google_client_secret',
        'clist_client_id',
        'clist_client_secret'
    ]);

    const turnstileEnabled =
        config.turnstile_enabled === 'true' &&
        !!config.turnstile_site_key.trim() &&
        !!config.turnstile_secret_key.trim();

    return {
        siteTitle: config.site_title,
        registrationEnabled: config.registration_enabled === 'true',
        recentUsersCount: Number(config.home_recent_users_count),
        turnstileEnabled,
        turnstileSiteKey: turnstileEnabled ? config.turnstile_site_key : '',
        codeforcesLoginEnabled:
            !!config.codeforces_client_id.trim() && !!config.codeforces_client_secret.trim(),
        githubLoginEnabled:
            !!config.github_client_id.trim() && !!config.github_client_secret.trim(),
        googleLoginEnabled:
            !!config.google_client_id.trim() && !!config.google_client_secret.trim(),
        clistLoginEnabled: !!config.clist_client_id.trim() && !!config.clist_client_secret.trim()
    };
});
