// CORS middleware for OAuth endpoints - allows cross-origin requests
// from localhost test clients and registered OAuth applications
export default defineEventHandler(event => {
    // Apply CORS headers to OAuth API endpoints
    if (event.path.startsWith('/api/oauth/')) {
        setHeader(event, 'Access-Control-Allow-Origin', '*');
        setHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization');
        setHeader(event, 'Access-Control-Max-Age', 86400);

        if (event.method === 'OPTIONS') {
            setResponseStatus(event, 204);
            return null;
        }
    }
});
