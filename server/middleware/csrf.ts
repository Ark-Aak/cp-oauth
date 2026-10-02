import { createError, defineEventHandler, getHeader, getRequestURL } from 'h3';
import { getPublicBaseUrl } from '~/server/utils/base-url';

const PUBLIC_PROTOCOL_PATHS: Record<string, true> = {
    '/api/oauth/token': true,
    '/api/oauth/revoke': true,
    '/api/oauth/userinfo': true
};

export default defineEventHandler(event => {
    const path = getRequestURL(event).pathname;
    if (!path.startsWith('/api/') || Object.hasOwn(PUBLIC_PROTOCOL_PATHS, path)) return;
    const createsState =
        event.method === 'GET' &&
        /^\/api\/auth\/thirdparty\/(?:github|google|codeforces|clist)\/start$/.test(path);
    if (!createsState && !['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)) return;
    if (getHeader(event, 'x-cp-oauth-csrf') !== '1') {
        throw createError({
            statusCode: 403,
            message: 'Same-origin request required',
            data: { code: 'CSRF_REJECTED' }
        });
    }
    const origin = getHeader(event, 'origin');
    const fetchSite = getHeader(event, 'sec-fetch-site');
    if (
        (origin && origin !== new URL(getPublicBaseUrl()).origin) ||
        (fetchSite && fetchSite !== 'same-origin')
    ) {
        throw createError({
            statusCode: 403,
            message: 'Cross-site requests are not allowed',
            data: { code: 'CSRF_REJECTED' }
        });
    }
});
