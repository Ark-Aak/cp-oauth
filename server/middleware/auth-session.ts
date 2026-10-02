import { getRequestURL, defineEventHandler } from 'h3';
import { loadAuthSession } from '~/server/utils/auth';

const PUBLIC_PATHS: Record<string, true> = {
    '/api/healthz': true,
    '/api/readyz': true,
    '/api/public/config': true,
    '/api/public/stats': true,
    '/api/public/notices': true,
    '/api/public/showcase': true,
    '/api/public/hitokoto': true,
    '/api/users': true,
    '/api/oauth/token': true,
    '/api/oauth/revoke': true,
    '/api/oauth/userinfo': true
};

export default defineEventHandler(async event => {
    const path = getRequestURL(event).pathname;
    if (
        !path.startsWith('/api/') ||
        Object.hasOwn(PUBLIC_PATHS, path) ||
        /^\/api\/users\/[^/]+(?:\/(?:card\.svg|stats))?$/.test(path)
    )
        return;
    try {
        await loadAuthSession(event);
    } catch {
        // Primary endpoints may continue; protected handlers fail closed via getAuthContext.
        event.context.authUnavailable = true;
    }
});
