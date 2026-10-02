import { hasC0ControlCharacters } from './control-characters';

export function isSafeOAuthRedirectUri(redirectUri: string): boolean {
    if (
        hasC0ControlCharacters(redirectUri) ||
        redirectUri.includes('\u007f') ||
        /[ \\#]/.test(redirectUri)
    )
        return false;
    const authority = /^https?:\/\/([^/?#]+)/i.exec(redirectUri)?.[1];
    if (!authority || authority.includes('@')) return false;
    try {
        const parsed = new URL(redirectUri);
        if (!parsed.hostname || parsed.username || parsed.password || parsed.hash) return false;
        if (parsed.protocol === 'https:') return true;
        return (
            parsed.protocol === 'http:' &&
            /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(authority)
        );
    } catch {
        return false;
    }
}
