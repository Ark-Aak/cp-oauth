import { SCOPES } from '~/utils/oauth-scopes';

/** OAuth authorization-server metadata; openid grants a sub, not an ID token. */
export function buildOAuthMetadata(issuer: string) {
    return {
        issuer,
        authorization_endpoint: new URL('/oauth/authorize', issuer).toString(),
        token_endpoint: new URL('/api/oauth/token', issuer).toString(),
        userinfo_endpoint: new URL('/api/oauth/userinfo', issuer).toString(),
        revocation_endpoint: new URL('/api/oauth/revoke', issuer).toString(),
        scopes_supported: Object.keys(SCOPES),
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
        revocation_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
        code_challenge_methods_supported: ['S256', 'plain']
    };
}
