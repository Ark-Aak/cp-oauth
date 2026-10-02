import type { MeResponse } from '~/types/api';
import type { AuthResult, TwoFactorMethod } from '~/types/auth';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import type { OAuthProvider } from '~/utils/platforms';

export interface PendingAuthenticationChallenge {
    challengeId: string;
    method: TwoFactorMethod;
    redirect: string;
    expiresAt: number;
}
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous' | 'error';

export function useAuth() {
    const nuxtApp = useNuxtApp();
    const api = useApi();
    const colorMode = useColorMode();
    const reauthentication = useReauthentication();
    const user = useState<MeResponse | null>('auth:user', () => null);
    const status = useState<AuthStatus>('auth:status', () => 'unknown');
    const error = useState<string | null>('auth:error', () => null);
    const pendingChallenge = useState<PendingAuthenticationChallenge | null>(
        'auth:mfa',
        () => null
    );
    const verificationEmailFailed = useState<boolean>(
        'auth:verification-email-failed',
        () => false
    );
    const preferencesApplied = useState<string | null>('auth:preferences-applied', () => null);

    function clearPending() {
        pendingChallenge.value = null;
        reauthentication.clear();
    }

    function rememberRedirect(provider: OAuthProvider, target: string) {
        if (import.meta.server) return;
        try {
            sessionStorage.setItem(
                `cp-oauth:auth-redirect:${provider}`,
                getSafeRedirectTarget(target)
            );
        } catch {
            // A blocked storage area only loses this non-secret failure-page hint.
        }
    }

    function takeRedirect(provider: OAuthProvider, fallback = '/') {
        const safeFallback = getSafeRedirectTarget(fallback);
        if (import.meta.server) return safeFallback;
        try {
            const key = `cp-oauth:auth-redirect:${provider}`;
            const target = sessionStorage.getItem(key);
            sessionStorage.removeItem(key);
            return getSafeRedirectTarget(target, safeFallback);
        } catch {
            return safeFallback;
        }
    }

    async function applyPreferences(value: MeResponse) {
        const marker = `${import.meta.server ? 'server' : 'client'}:${value.id}:${value.theme}:${value.locale}`;
        if (preferencesApplied.value === marker) return;
        colorMode.preference = value.theme;
        if (nuxtApp.$i18n.locale.value !== value.locale) {
            await nuxtApp.$i18n.setLocale(value.locale);
        }
        preferencesApplied.value = marker;
    }

    const preferencesHook = useState('auth:preferences-hydration-hook', () => false);
    if (import.meta.client && nuxtApp.isHydrating && !preferencesHook.value) {
        preferencesHook.value = true;
        nuxtApp.hook('app:mounted', async () => {
            // Flush the color-mode module's restored helper before applying account preferences.
            await nextTick();
            preferencesApplied.value = null;
            if (user.value) await applyPreferences(user.value);
        });
    }

    const me = useAsyncData(
        'auth:me',
        async (_app, { signal }) => {
            try {
                const value = await api<MeResponse>('/api/auth/me', { signal });
                if (signal.aborted)
                    throw new DOMException('Identity refresh cancelled', 'AbortError');
                if (user.value && user.value.id !== value.id) clearPending();
                user.value = value;
                status.value = 'authenticated';
                error.value = null;
                await applyPreferences(value);
                return { user: value };
            } catch (cause) {
                if (signal.aborted) throw cause;
                const failure = cause as {
                    statusCode?: number;
                    status?: number;
                    data?: { message?: string };
                };
                if ((failure.statusCode ?? failure.status) === 401) {
                    user.value = null;
                    status.value = 'anonymous';
                    error.value = null;
                    preferencesApplied.value = null;
                    return { user: null };
                }
                status.value = 'error';
                error.value =
                    failure.data?.message || nuxtApp.$i18n.t('identity.identity_unavailable');
                throw cause;
            }
        },
        {
            immediate: false,
            deep: false,
            dedupe: 'defer',
            getCachedData: (key, app, context) =>
                context.cause === 'initial'
                    ? (app.payload.data[key] ?? app.static.data[key])
                    : undefined
        }
    );

    async function load(force = false) {
        if (!force && status.value === 'error') {
            throw me.error.value || new Error(error.value || 'Identity unavailable');
        }
        if (!force && (status.value === 'authenticated' || status.value === 'anonymous')) {
            if (user.value) await applyPreferences(user.value);
            return user.value;
        }
        await me.execute({ dedupe: force ? 'cancel' : 'defer' });
        if (status.value === 'error')
            throw me.error.value || new Error(error.value || 'Identity unavailable');
        return user.value;
    }

    async function accept(result: AuthResult) {
        const redirect = getSafeRedirectTarget(result.redirect);
        if ('requiresTwoFactor' in result) {
            clearPending();
            pendingChallenge.value = {
                challengeId: result.challengeId,
                method: result.method,
                redirect,
                expiresAt: Date.now() + 600_000
            };
            await navigateTo({ path: '/login', query: { step: 'two-factor', redirect } });
            return;
        }
        if ('reauthToken' in result) {
            pendingChallenge.value = null;
            reauthentication.accept(result);
            await navigateTo(redirect);
            return;
        }
        clearPending();
        preferencesApplied.value = null;
        if ('verificationEmailSent' in result) {
            verificationEmailFailed.value = result.verificationEmailSent === false;
        }
        await load(true);
        if (status.value !== 'authenticated')
            throw new Error(nuxtApp.$i18n.t('identity.identity_unavailable'));
        await navigateTo(redirect);
    }

    async function logout(redirect = '/') {
        await api('/api/auth/logout', { method: 'POST' });
        user.value = null;
        status.value = 'anonymous';
        error.value = null;
        preferencesApplied.value = null;
        verificationEmailFailed.value = false;
        clearPending();
        clearNuxtData('auth:me');
        await navigateTo(getSafeRedirectTarget(redirect));
    }

    return {
        user,
        status,
        error,
        load,
        accept,
        logout,
        pendingChallenge,
        clearPending,
        verificationEmailFailed,
        rememberRedirect,
        takeRedirect
    };
}
