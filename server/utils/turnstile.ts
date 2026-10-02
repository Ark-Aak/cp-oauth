import { consola } from 'consola';
import { getConfig } from './config';
import { getPublicBaseUrl } from './base-url';
import type { $Fetch } from 'ofetch';

const logger = consola.withTag('security:turnstile');

export async function verifyTurnstileToken(params: {
    token: string | null | undefined;
    action: string;
}): Promise<void> {
    const { turnstile_enabled: turnstileEnabled, turnstile_secret_key: secret } = await getConfig([
        'turnstile_enabled',
        'turnstile_secret_key'
    ]);
    if (turnstileEnabled !== 'true') {
        return;
    }

    const token = params.token?.trim();
    if (!token) {
        logger.warn(`Captcha required but missing for ${params.action}`);
        throw createError({ statusCode: 400, message: 'Captcha verification required' });
    }

    let res: { success: boolean; hostname?: string; action?: string };
    try {
        res = await ($fetch as $Fetch)(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            {
                method: 'POST',
                body: { secret, response: token },
                timeout: 10_000,
                retry: 0
            }
        );
    } catch {
        throw createError({ statusCode: 502, message: 'Captcha verification is unavailable' });
    }

    if (
        !res.success ||
        res.hostname !== new URL(getPublicBaseUrl()).hostname ||
        res.action !== params.action
    ) {
        logger.warn(`Captcha verification failed for ${params.action}`);
        throw createError({ statusCode: 400, message: 'Captcha verification failed' });
    }
}
