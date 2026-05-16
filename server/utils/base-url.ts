import type { H3Event } from 'h3';

/**
 * Returns the base URL for generating links in outgoing emails
 * (password reset, email verification, etc.).
 *
 * Always reads from the PUBLIC_BASE_URL runtime config.
 * The HTTP Host header is NOT trusted, to prevent Host Header Injection
 * attacks where a forged Host header would cause sensitive tokens
 * (e.g. password reset tokens) to be sent to attacker-controlled domains.
 *
 * @see https://owasp.org/www-community/attacks/Host_Header_Injection
 */
export function getPublicBaseUrl(_event?: H3Event): string {
    const config = useRuntimeConfig();
    const baseUrl = config.publicBaseUrl;
    if (!baseUrl) {
        throw createError({
            statusCode: 500,
            message: 'PUBLIC_BASE_URL is not configured'
        });
    }
    return baseUrl.replace(/\/+$/, '');
}
