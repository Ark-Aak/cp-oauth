import type { MeResponse } from '~/types/api';

/** Request-scoped signed-in user. Loaded once by `plugins/session.ts`. */
export function useSession() {
    const api = useApi();
    const user = useState<MeResponse | null>('cp-session-user', () => null);
    const unavailable = useState('cp-session-unavailable', () => false);

    const isSignedIn = computed(() => user.value !== null);
    const isAdmin = computed(() => user.value?.role === 'admin');

    async function refresh(): Promise<MeResponse | null> {
        try {
            user.value = await api<MeResponse>('/api/auth/me');
            unavailable.value = false;
        } catch (error) {
            const { status } = readApiError(error);
            user.value = null;
            unavailable.value = status >= 500 || status === 0;
        }
        return user.value;
    }

    function setUser(next: MeResponse | null) {
        user.value = next;
    }

    /**
     * Ends the server session, then forgets the user locally. Throws when the logout request
     * fails: the HttpOnly cookie is still valid then, so the UI must keep showing the account.
     */
    async function signOut(target = '/login') {
        await api('/api/auth/logout', { method: 'POST' });
        user.value = null;
        await navigateTo(target);
    }

    return { user, unavailable, isSignedIn, isAdmin, refresh, setUser, signOut };
}
