import type { PublicConfigResponse } from '~/types/api';

const FALLBACK: PublicConfigResponse = {
    siteTitle: 'CP OAuth',
    registrationEnabled: false,
    recentUsersCount: 6,
    turnstileEnabled: false,
    turnstileSiteKey: '',
    githubLoginEnabled: false,
    googleLoginEnabled: false,
    codeforcesLoginEnabled: false,
    clistLoginEnabled: false
};

/** Request-scoped public site configuration. Loaded once by `plugins/session.ts`. */
export function usePublicConfig() {
    const api = useApi();
    const config = useState<PublicConfigResponse>('cp-public-config', () => ({ ...FALLBACK }));
    const loaded = useState('cp-public-config-loaded', () => false);

    async function refresh() {
        try {
            config.value = await api<PublicConfigResponse>('/api/public/config');
            loaded.value = true;
        } catch {
            loaded.value = false;
        }
        return config.value;
    }

    return { config, loaded, refresh };
}
