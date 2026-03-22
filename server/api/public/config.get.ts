import { getConfig } from '~/server/utils/config';

export default defineEventHandler(async () => {
    const turnstileEnabled = await getConfig('turnstile_enabled');
    const turnstileSiteKey =
        turnstileEnabled === 'true' ? await getConfig('turnstile_site_key') : '';
    const siteTitle = await getConfig('site_title');
    const registrationEnabled = await getConfig('registration_enabled');
    const codeforcesClientId = await getConfig('codeforces_client_id');

    return {
        siteTitle,
        registrationEnabled: registrationEnabled !== 'false',
        turnstileEnabled: turnstileEnabled === 'true',
        turnstileSiteKey,
        codeforcesLoginEnabled: codeforcesClientId.trim().length > 0
    };
});
