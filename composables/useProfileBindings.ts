import { computed, onScopeDispose, ref } from 'vue';
import type { LinkedAccount } from '~/types/api';
import {
    PLATFORMS,
    isPlatform,
    type OAuthProvider,
    type Platform,
    type VerifiablePlatform
} from '~/utils/platforms';
import {
    profileError,
    profileFieldErrors,
    type ProfileRequestStatus
} from '~/components/profile/profile-workbench';

export interface ProfileBindingChallenge {
    requestId: string;
    code: string;
    expiresIn: number;
    expiresAt: number;
}

type BindingMutation = 'request' | 'verify' | 'unlink' | 'refresh' | 'oauth';
type BindingFailure = {
    statusCode?: number;
    status?: number;
    response?: { status?: number };
    data?: { code?: string; retryAfter?: number; data?: { code?: string; retryAfter?: number } };
};

function isLinkedAccount(value: unknown): value is LinkedAccount {
    if (!value || typeof value !== 'object') return false;
    const account = value as Record<string, unknown>;
    return (
        typeof account.id === 'string' &&
        account.id.length > 0 &&
        typeof account.platform === 'string' &&
        isPlatform(account.platform) &&
        typeof account.platformUid === 'string' &&
        account.platformUid.length > 0 &&
        (account.platformUsername === null || typeof account.platformUsername === 'string') &&
        typeof account.verifiedAt === 'string' &&
        Number.isFinite(Date.parse(account.verifiedAt))
    );
}

export function useProfileBindings() {
    const api = useApi();
    const auth = useAuth();
    const reauthentication = useReauthentication();
    const { t } = useI18n();
    const bindings = ref<LinkedAccount[]>([]);
    const status = ref<ProfileRequestStatus>('idle');
    const error = ref<string | null>(null);
    const mutation = ref<BindingMutation | null>(null);
    const pendingPlatform = ref<Platform | null>(null);
    const mutationError = ref<string | null>(null);
    const mutationErrors = ref<Partial<Record<Platform, string>>>({});
    const fieldErrors = ref<Record<string, string>>({});
    const challengeExpired = ref(false);
    const notice = ref<string | null>(null);
    const refreshCooldowns = ref<Partial<Record<Platform, number>>>({});
    const identityError = ref<string | null>(null);
    const identityPending = ref(false);
    const pending = computed(() => mutation.value !== null || identityPending.value);
    let loadPromise: Promise<LinkedAccount[]> | null = null;
    let identityPromise: Promise<boolean> | null = null;
    let generation = 0;
    let disposed = false;
    let awaitingProof = false;

    function load(force = false): Promise<LinkedAccount[]> {
        if (loadPromise) return loadPromise;
        if (!force && status.value === 'success') return Promise.resolve(bindings.value);
        status.value = 'pending';
        error.value = null;
        loadPromise = (async () => {
            try {
                const accounts = await api<unknown>('/api/account/bindings');
                if (!Array.isArray(accounts)) {
                    throw new Error(t('identity.network_error'));
                }
                const seenPlatforms = new Set<Platform>();
                for (const account of accounts) {
                    if (!isLinkedAccount(account) || seenPlatforms.has(account.platform)) {
                        throw new Error(t('identity.network_error'));
                    }
                    seenPlatforms.add(account.platform);
                }
                if (!disposed) {
                    bindings.value = accounts;
                    status.value = 'success';
                }
                return accounts;
            } catch (cause) {
                if (!disposed) {
                    error.value = profileError(cause, t('identity.network_error'));
                    status.value = 'error';
                }
                throw cause;
            } finally {
                loadPromise = null;
            }
        })();
        return loadPromise;
    }

    function refreshIdentity(): Promise<boolean> {
        if (identityPromise) return identityPromise;
        identityPending.value = true;
        identityError.value = null;
        auth.clearPending();
        identityPromise = (async () => {
            try {
                await auth.load(true);
                return true;
            } catch (cause) {
                if (!disposed)
                    identityError.value = profileError(cause, t('identity.identity_unavailable'));
                return false;
            } finally {
                if (!disposed) identityPending.value = false;
                identityPromise = null;
            }
        })();
        return identityPromise;
    }

    async function proof(current: number): Promise<string | null> {
        awaitingProof = true;
        try {
            const token = await reauthentication.require('binding_change');
            if (disposed || current !== generation) return null;
            if (!token) notice.value = t('reauth.cancelled');
            return token;
        } finally {
            awaitingProof = false;
        }
    }

    async function mutate<T>(
        operation: BindingMutation,
        platform: Platform | null,
        action: (current: number) => Promise<T | null>
    ): Promise<T | null> {
        if (pending.value || disposed) return null;
        const current = generation;
        mutation.value = operation;
        pendingPlatform.value = platform;
        mutationError.value = null;
        fieldErrors.value = {};
        challengeExpired.value = false;
        notice.value = null;
        if (platform) Reflect.deleteProperty(mutationErrors.value, platform);
        try {
            return await action(current);
        } catch (cause) {
            if (!disposed && current === generation) {
                const failure = cause as BindingFailure;
                const code = failure?.data?.data?.code ?? failure?.data?.code;
                challengeExpired.value = code === 'AUTH_CHALLENGE_EXPIRED';
                fieldErrors.value = profileFieldErrors(cause);
                const fallback =
                    operation === 'unlink'
                        ? 'binding.unlink_error'
                        : operation === 'refresh'
                          ? 'binding.refresh_error'
                          : 'binding.verify_error';
                const retryAfter = failure?.data?.data?.retryAfter ?? failure?.data?.retryAfter;
                const cooldownSeconds =
                    operation === 'refresh' &&
                    platform &&
                    (failure?.statusCode ?? failure?.status ?? failure?.response?.status) === 429 &&
                    typeof retryAfter === 'number' &&
                    Number.isFinite(retryAfter) &&
                    retryAfter > 0
                        ? retryAfter
                        : null;
                if (cooldownSeconds !== null && platform) {
                    refreshCooldowns.value[platform] = Date.now() + cooldownSeconds * 1000;
                    mutationError.value = t('binding.workbench.refresh_cooldown_minutes', {
                        minutes: Math.ceil(cooldownSeconds / 60)
                    });
                } else {
                    mutationError.value = profileError(cause, t(fallback));
                    if (platform) mutationErrors.value[platform] = mutationError.value;
                }
            }
            throw cause;
        } finally {
            if (!disposed) {
                mutation.value = null;
                pendingPlatform.value = null;
            }
        }
    }

    function requestBind(platform: VerifiablePlatform, uid: string) {
        return mutate<ProfileBindingChallenge>('request', platform, async current => {
            const token = await proof(current);
            if (!token) return null;
            const startedAt = Date.now();
            reauthentication.consume('binding_change', token);
            const result = await api<
                Pick<ProfileBindingChallenge, 'requestId' | 'code' | 'expiresIn'>
            >('/api/account/bind/request', {
                method: 'POST',
                body: { platform, platformUid: uid.trim(), reauthToken: token }
            });
            if (
                !result ||
                typeof result.requestId !== 'string' ||
                !result.requestId ||
                typeof result.code !== 'string' ||
                !result.code ||
                !Number.isFinite(result.expiresIn) ||
                result.expiresIn <= 0
            ) {
                throw new Error(t('identity.network_error'));
            }
            if (disposed || current !== generation) return null;
            return { ...result, expiresAt: startedAt + result.expiresIn * 1000 };
        });
    }

    function verifyBind(requestId: string, credential: string) {
        return mutate<LinkedAccount>('verify', null, async current => {
            const account = await api<unknown>('/api/account/bind/verify', {
                method: 'POST',
                body: { requestId, credential }
            });
            await refreshIdentity();
            if (!isLinkedAccount(account)) throw new Error(t('identity.network_error'));
            if (disposed || current !== generation) return null;
            const index = bindings.value.findIndex(
                binding => binding.platform === account.platform
            );
            if (index < 0) bindings.value.push(account);
            else bindings.value[index] = account;
            return account;
        });
    }

    function unlink(platform: Platform) {
        return mutate<boolean>('unlink', platform, async current => {
            const token = await proof(current);
            if (!token) return null;
            reauthentication.consume('binding_change', token);
            await api(`/api/account/bind/${platform}`, {
                method: 'DELETE',
                headers: { 'X-CP-OAuth-Reauth': token }
            });
            if (!disposed && current === generation) {
                const index = bindings.value.findIndex(account => account.platform === platform);
                if (index >= 0) bindings.value.splice(index, 1);
                Reflect.deleteProperty(refreshCooldowns.value, platform);
            }
            await refreshIdentity();
            return disposed || current !== generation ? null : true;
        });
    }

    function refreshOwn(account: LinkedAccount) {
        return mutate<LinkedAccount>('refresh', account.platform, async current => {
            const target = bindings.value.find(
                binding =>
                    binding.id === account.id &&
                    binding.platform === account.platform &&
                    binding.platformUid === account.platformUid
            );
            if (!target || !PLATFORMS[account.platform].refreshable) {
                throw new Error(t('identity.permission_denied'));
            }
            const result = await api<{ platformUsername: string }>(
                '/api/account/refresh-username',
                {
                    method: 'POST',
                    body: { platform: target.platform, platformUid: target.platformUid }
                }
            );
            if (
                !result ||
                typeof result.platformUsername !== 'string' ||
                !result.platformUsername
            ) {
                throw new Error(t('binding.refresh_error'));
            }
            if (disposed || current !== generation) return null;
            const retained = bindings.value.find(
                binding => binding.id === target.id && binding.platformUid === target.platformUid
            );
            if (!retained) return null;
            retained.platformUsername = result.platformUsername;
            Reflect.deleteProperty(refreshCooldowns.value, account.platform);
            return retained;
        });
    }

    function beginOAuthBind(provider: OAuthProvider) {
        return mutate<boolean>('oauth', provider, async current => {
            const token = await proof(current);
            if (!token) return null;
            const redirect = '/profile?tab=bindings';
            reauthentication.consume('binding_change', token);
            const result = await api<{ authorizationUrl: string }>(
                `/api/auth/thirdparty/${provider}/start`,
                { headers: { 'X-CP-OAuth-Reauth': token }, query: { mode: 'bind', redirect } }
            );
            if (disposed || current !== generation) return null;
            const destination = new URL(result.authorizationUrl);
            if (destination.protocol !== 'https:' || destination.username || destination.password) {
                throw new Error(t('binding.verify_error'));
            }
            auth.rememberRedirect(provider, redirect);
            await navigateTo(destination.href, { external: true });
            return true;
        });
    }

    function cancelPendingProof() {
        generation += 1;
        if (awaitingProof && reauthentication.purpose.value === 'binding_change') {
            reauthentication.cancel();
        }
        mutationError.value = null;
        fieldErrors.value = {};
        challengeExpired.value = false;
        notice.value = null;
    }

    onScopeDispose(() => {
        disposed = true;
        cancelPendingProof();
    });

    return {
        bindings,
        status,
        error,
        load,
        requestBind,
        verifyBind,
        unlink,
        refreshOwn,
        beginOAuthBind,
        pending,
        mutation,
        pendingPlatform,
        mutationError,
        mutationErrors,
        fieldErrors,
        challengeExpired,
        notice,
        refreshCooldowns,
        identityError,
        identityPending,
        refreshIdentity,
        cancelPendingProof
    };
}
