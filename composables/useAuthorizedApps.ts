import type { AuthorizedApp } from '~/types/api';
import { profileError, type ProfileRequestStatus } from '~/components/profile/profile-workbench';

export function useAuthorizedApps() {
    const api = useApi();
    const { t } = useI18n();
    const apps = ref<AuthorizedApp[]>([]);
    const status = ref<ProfileRequestStatus>('idle');
    const error = ref<string | null>(null);
    const mutationError = ref<string | null>(null);
    const pendingClientId = ref<string | null>(null);
    let request: Promise<void> | null = null;

    function load(force = false): Promise<void> {
        if (request) return request;
        if (!force && status.value === 'success') return Promise.resolve();
        status.value = 'pending';
        error.value = null;
        request = (async () => {
            try {
                apps.value = await api<AuthorizedApp[]>('/api/oauth/authorized-apps');
                status.value = 'success';
            } catch (cause) {
                error.value = profileError(cause, t('identity.network_error'));
                status.value = 'error';
                throw cause;
            } finally {
                request = null;
            }
        })();
        return request;
    }

    async function revoke(clientId: string): Promise<boolean> {
        if (pendingClientId.value) return false;
        pendingClientId.value = clientId;
        mutationError.value = null;
        try {
            await api(`/api/oauth/authorized-apps/${encodeURIComponent(clientId)}`, {
                method: 'DELETE'
            });
            apps.value = apps.value.filter(app => app.clientId !== clientId);
            try {
                await load(true);
            } catch {
                // Revocation succeeded; a separate read error remains visible with retry.
            }
            return true;
        } catch (cause) {
            mutationError.value = profileError(cause, t('oauth.authorized_apps.revoke_error'));
            throw cause;
        } finally {
            pendingClientId.value = null;
        }
    }

    return { apps, status, error, load, revoke, pendingClientId, mutationError };
}
