import type { $Fetch, FetchOptions } from 'ofetch';
import type { MeResponse } from '~/types/api';
import { hasC0ControlCharacters } from '~/utils/control-characters';

export function useApi() {
    const requestFetch = useRequestFetch() as $Fetch;
    const user = useState<MeResponse | null>('auth:user', () => null);
    const status = useState<'unknown' | 'authenticated' | 'anonymous' | 'error'>(
        'auth:status',
        () => 'unknown'
    );
    const error = useState<string | null>('auth:error', () => null);
    const pendingChallenge = useState('auth:mfa', () => null);
    const reauthentication = useReauthentication();

    return async function api<T>(path: string, options: FetchOptions<'json'> = {}): Promise<T> {
        if (
            options.baseURL ||
            !path.startsWith('/api/') ||
            path.includes('\\') ||
            path.includes('\u007f') ||
            hasC0ControlCharacters(path)
        ) {
            throw new TypeError('Only local /api/ requests are allowed');
        }
        const target = new URL(path, 'https://cp-oauth.invalid');
        if (target.origin !== 'https://cp-oauth.invalid' || !target.pathname.startsWith('/api/')) {
            throw new TypeError('Only local /api/ requests are allowed');
        }
        const headers = new Headers(options.headers);
        headers.set('X-CP-OAuth-CSRF', '1');
        try {
            return await requestFetch<T>(path, {
                ...options,
                headers,
                baseURL: undefined,
                credentials: 'same-origin',
                retry: 0
            });
        } catch (cause) {
            if (options.signal?.aborted) throw cause;
            const failure = cause as {
                status?: number;
                statusCode?: number;
                response?: { status: number };
                data?: { code?: string; data?: { code?: string } };
            };
            const code = failure.data?.data?.code ?? failure.data?.code;
            const credentialFailure =
                code === 'INVALID_MFA_CODE' ||
                code === 'INVALID_REAUTH_CREDENTIAL' ||
                code === 'INVALID_PASSKEY_CREDENTIAL' ||
                code === 'INVALID_CREDENTIALS';
            if (
                (failure.statusCode ?? failure.status ?? failure.response?.status) === 401 &&
                !credentialFailure
            ) {
                user.value = null;
                status.value = 'anonymous';
                error.value = null;
                pendingChallenge.value = null;
                reauthentication.clear();
            }
            throw cause;
        }
    };
}
