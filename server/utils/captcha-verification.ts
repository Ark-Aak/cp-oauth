import { createError } from 'h3';
import type { $Fetch } from 'ofetch';
import { captchaProviders, capEndpoint, type CaptchaPolicy } from '~/utils/captcha';

export interface CaptchaVerificationConfig extends CaptchaPolicy {
    turnstileSecretKey: string;
    capInstanceUrl: string;
    capSiteKey: string;
    capSecretKey: string;
}

/** Provider failures never turn off verification or reuse a token at another provider. */
export async function verifyConfiguredCaptcha(
    config: CaptchaVerificationConfig,
    params: { token: string | null | undefined; action: string },
    hostname: string,
    fetcher: $Fetch
): Promise<void> {
    const providers = captchaProviders(config);
    if (!providers.length) return;
    const token = params.token?.trim();
    if (!token) throw createError({ statusCode: 400, message: 'Captcha verification required' });
    // Retain the existing turnstileToken API field and unprefixed Turnstile tokens.
    const provider = token.startsWith('cap:') ? 'cap' : 'turnstile';
    const response = provider === 'cap' ? token.slice(4) : token;
    if (!providers.includes(provider) || !response) {
        throw createError({ statusCode: 400, message: 'Captcha provider is not enabled' });
    }
    const secret = provider === 'cap' ? config.capSecretKey : config.turnstileSecretKey;
    if (!secret.trim())
        throw createError({ statusCode: 503, message: 'Captcha is not configured' });
    let result: { success?: boolean; hostname?: string; action?: string; 'error-codes'?: string[] };
    let responseStatus = 200;
    try {
        result = await fetcher(
            provider === 'cap'
                ? `${capEndpoint(config.capInstanceUrl, config.capSiteKey)}siteverify`
                : 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            {
                method: 'POST',
                body: { secret, response },
                timeout: 10_000,
                retry: 0,
                redirect: 'error',
                ignoreResponseError: true,
                onResponse({ response: res }) {
                    responseStatus = res.status;
                    // CAP returns 4xx for rejected tokens. Those are verification failures,
                    // while upstream 5xx means the service itself is unavailable.
                    if (res.status >= 500 || res.status === 429)
                        throw new Error('Provider unavailable');
                }
            }
        );
        if (!result || typeof result.success !== 'boolean')
            throw new Error('Invalid provider response');
        if (result['error-codes']?.includes('internal-error'))
            throw new Error('Provider internal error');
    } catch {
        const fallbackProvider = providers.find(item => item !== provider);
        throw createError({
            statusCode: 502,
            message: 'Captcha verification is unavailable',
            data: {
                code: 'CAPTCHA_UNAVAILABLE',
                provider,
                ...(fallbackProvider ? { fallbackProvider } : {})
            }
        });
    }
    if (
        responseStatus < 200 ||
        responseStatus >= 300 ||
        !result.success ||
        (provider === 'turnstile' &&
            (result.hostname !== hostname || result.action !== params.action))
    ) {
        throw createError({ statusCode: 400, message: 'Captcha verification failed' });
    }
}
