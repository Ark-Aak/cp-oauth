import type { $Fetch } from 'ofetch';
import { getConfig } from './config';
import { getPublicBaseUrl } from './base-url';
import { verifyConfiguredCaptcha } from './captcha-verification';

export async function verifyCaptchaToken(params: {
    token: string | null | undefined;
    action: string;
}): Promise<void> {
    const config = await getConfig([
        'turnstile_enabled',
        'turnstile_secret_key',
        'cap_enabled',
        'cap_instance_url',
        'cap_site_key',
        'cap_secret_key',
        'captcha_preferred_provider',
        'captcha_auto_failover'
    ]);
    await verifyConfiguredCaptcha(
        {
            turnstileEnabled: config.turnstile_enabled === 'true',
            turnstileSecretKey: config.turnstile_secret_key,
            capEnabled: config.cap_enabled === 'true',
            capInstanceUrl: config.cap_instance_url,
            capSiteKey: config.cap_site_key,
            capSecretKey: config.cap_secret_key,
            captchaPreferredProvider: config.captcha_preferred_provider as 'turnstile' | 'cap',
            captchaAutoFailover: config.captcha_auto_failover === 'true'
        },
        params,
        new URL(getPublicBaseUrl()).hostname,
        $fetch as $Fetch
    );
}
