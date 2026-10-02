import { getRequestURL } from 'h3';

const PUBLIC_PROTOCOL_ROUTES: Record<string, { method: 'GET' | 'POST'; headers: string }> = {
    '/api/oauth/token': { method: 'POST', headers: 'Content-Type' },
    '/api/oauth/revoke': { method: 'POST', headers: 'Content-Type' },
    '/api/oauth/userinfo': { method: 'GET', headers: 'Authorization' },
    '/.well-known/openid-configuration': { method: 'GET', headers: 'Accept' },
    '/.well-known/oauth-authorization-server': { method: 'GET', headers: 'Accept' }
};

export default defineEventHandler(event => {
    const path = getRequestURL(event).pathname;
    if (!Object.hasOwn(PUBLIC_PROTOCOL_ROUTES, path)) return;
    const route = PUBLIC_PROTOCOL_ROUTES[path]!;
    setHeader(event, 'Access-Control-Allow-Origin', '*');
    setHeader(event, 'Access-Control-Allow-Methods', `${route.method}, OPTIONS`);
    setHeader(event, 'Access-Control-Allow-Headers', route.headers);
    setHeader(event, 'Access-Control-Max-Age', 86400);
    if (event.method === 'OPTIONS') {
        setResponseStatus(event, 204);
        return '';
    }
});
