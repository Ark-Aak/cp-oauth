import { hasC0ControlCharacters } from './control-characters';

export function buildLoginPath(redirectTo: string): string {
    return `/login?redirect=${encodeURIComponent(redirectTo)}`;
}

export function getSafeRedirectTarget(
    redirect: string | null | Array<string | null> | undefined,
    fallback = '/'
): string {
    const raw = Array.isArray(redirect) ? redirect[0] : redirect;
    if (typeof raw !== 'string') return fallback;
    const target = raw.trim();
    if (
        !target.startsWith('/') ||
        hasC0ControlCharacters(target) ||
        target.includes('\u007f') ||
        /\\|%5c|%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(target)
    )
        return fallback;
    try {
        const parsed = new URL(target, 'https://cp-oauth.invalid');
        if (parsed.origin !== 'https://cp-oauth.invalid') return fallback;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return fallback;
    }
}
