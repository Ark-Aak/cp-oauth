import { SCOPES } from '../../utils/oauth';

const CLAIMS_SUPPORTED = [
    'sub',
    'username',
    'display_name',
    'avatar_url',
    'bio',
    'email',
    'email_verified',
    'linked_accounts',
    'link_scopes',
    'cp_summary',
    'cp_details'
];

function normalizeIssuer(value: string): string {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
}

function endpointUrl(issuer: string, path: string): string {
    const url = new URL(issuer);
    const basePath = url.pathname.replace(/\/+$/, '');
    url.pathname = `${basePath}${path}`;
    return url.toString();
}

function resolveIssuer(): string {
    const config = useRuntimeConfig();
    const configuredBaseUrl = String(config.publicBaseUrl || '').trim();

    if (!configuredBaseUrl) {
        throw createError({
            statusCode: 500,
            message: 'PUBLIC_BASE_URL is not configured'
        });
    }

    try {
        return normalizeIssuer(configuredBaseUrl);
    } catch {
        throw createError({
            statusCode: 500,
            message: 'Invalid PUBLIC_BASE_URL'
        });
    }
}

export default defineEventHandler(event => {
    const issuer = resolveIssuer();

    setHeader(event, 'cache-control', 'public, max-age=3600');

    return {
        issuer,
        authorization_endpoint: endpointUrl(issuer, '/oauth/authorize'),
        token_endpoint: endpointUrl(issuer, '/api/oauth/token'),
        userinfo_endpoint: endpointUrl(issuer, '/api/oauth/userinfo'),
        revocation_endpoint: endpointUrl(issuer, '/api/oauth/revoke'),
        scopes_supported: Object.keys(SCOPES),
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
        revocation_endpoint_auth_methods_supported: ['client_secret_post'],
        code_challenge_methods_supported: ['S256', 'plain'],
        subject_types_supported: ['public'],
        claim_types_supported: ['normal'],
        claims_supported: CLAIMS_SUPPORTED,
        claims_parameter_supported: false,
        request_parameter_supported: false,
        request_uri_parameter_supported: false
    };
});
