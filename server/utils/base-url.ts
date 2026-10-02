import { createError, type H3Event } from 'h3';
import { hasC0ControlCharacters } from '../../utils/control-characters';

export function normalizeSiteOrigin(value: unknown): string {
    const invalidOrigin = () =>
        createError({
            statusCode: 503,
            message: 'NUXT_PUBLIC_SITE_ORIGIN must be an HTTPS origin (HTTP is loopback-only)'
        });

    if (
        typeof value !== 'string' ||
        !value ||
        hasC0ControlCharacters(value) ||
        value.includes('\u007f') ||
        /[\\\s?#]/.test(value)
    ) {
        throw invalidOrigin();
    }

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw invalidOrigin();
    }

    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
        !url.hostname ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    ) {
        throw invalidOrigin();
    }

    return url.origin;
}

/**
 * Canonical origin for emails, OAuth callbacks and public metadata.
 * Request Host and forwarded headers never participate in link generation.
 */
export function getPublicBaseUrl(_event?: H3Event): string {
    return normalizeSiteOrigin(useRuntimeConfig().public.siteOrigin);
}
