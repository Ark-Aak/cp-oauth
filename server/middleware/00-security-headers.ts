import { defineEventHandler, getRequestURL, setHeader, setResponseHeaders } from 'h3';

const AUTH_PAGES: Record<string, true> = {
    '/login': true,
    '/register': true,
    '/forgot-password': true,
    '/reset-password': true,
    '/email-verified': true,
    '/oauth/authorize': true
};
const PRIVATE_API_PREFIXES = ['/api/auth/', '/api/account/', '/api/admin/', '/api/oauth/'];

export default defineEventHandler(event => {
    const path = getRequestURL(event).pathname;
    setResponseHeaders(event, {
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer'
    });

    const sensitivePage =
        Object.hasOwn(AUTH_PAGES, path) ||
        path.startsWith('/oauth/thirdparty/') ||
        path === '/admin' ||
        path.startsWith('/admin/');
    if (sensitivePage) {
        setHeader(event, 'content-security-policy', "frame-ancestors 'none'");
    }

    if (
        sensitivePage ||
        path === '/profile' ||
        path === '/developer' ||
        PRIVATE_API_PREFIXES.some(prefix => path.startsWith(prefix))
    ) {
        setHeader(event, 'cache-control', 'no-store');
    }
});
