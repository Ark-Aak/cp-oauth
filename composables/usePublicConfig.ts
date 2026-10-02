import type { PublicConfigResponse } from '~/types/api';

export function usePublicConfig() {
    return useFetch<PublicConfigResponse>('/api/public/config', {
        key: 'public:config',
        dedupe: 'defer',
        watch: false,
        headers: { 'X-CP-OAuth-CSRF': '1' },
        retry: 0
    });
}
