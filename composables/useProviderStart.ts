import type { ReauthPurpose } from '~/types/auth';
import type { OAuthProvider } from '~/utils/platforms';

export interface ProviderStartQuery {
    mode: 'login' | 'register' | 'bind' | 'reauth';
    redirect?: string;
    turnstileToken?: string;
    purpose?: ReauthPurpose;
}

/**
 * Starts a GitHub / Google / Codeforces / Clist round trip and leaves the page.
 * `bind` needs a `binding_change` proof, sent as the reauth header.
 */
export function useProviderStart() {
    const api = useApi();
    return async function startProvider(
        provider: OAuthProvider,
        query: ProviderStartQuery,
        reauthToken?: string
    ): Promise<void> {
        const params: Record<string, string> = { mode: query.mode };
        if (query.redirect) params.redirect = query.redirect;
        if (query.turnstileToken) params.turnstileToken = query.turnstileToken;
        if (query.purpose) params.purpose = query.purpose;
        const { authorizationUrl } = await api<{ authorizationUrl: string }>(
            `/api/auth/thirdparty/${provider}/start`,
            { query: params, reauthToken }
        );
        window.location.assign(authorizationUrl);
    };
}
