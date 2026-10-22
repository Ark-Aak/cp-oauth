import type { AuthResult, TwoFactorMethod } from '~/types/auth';

export interface PendingMfa {
    method: TwoFactorMethod;
    challengeId: string;
    redirect: string;
}

/**
 * Finishes any authentication result returned by the server:
 * - signed in: reloads the session, applies saved preferences, goes to the redirect;
 * - provider linked: reloads the session, goes to the redirect;
 * - identity proof: parks it for `useReauth().request()` and returns to the redirect;
 * - second factor needed: returns the pending challenge for `CpMfaForm`.
 */
export function useAuthFlow() {
    const session = useSession();
    const preferences = usePreferences();
    const { storeProof } = useReauth();

    async function complete(result: AuthResult, fallback = '/profile'): Promise<PendingMfa | null> {
        if ('requiresTwoFactor' in result) {
            return {
                method: result.method,
                challengeId: result.challengeId,
                redirect: result.redirect
            };
        }
        const target = getSafeRedirectTarget(result.redirect, fallback);
        if ('reauthToken' in result) {
            storeProof(result);
            await navigateTo(target, { replace: true });
            return null;
        }
        await session.refresh();
        if ('authenticated' in result) await preferences.applyAccount();
        await navigateTo(target === '/' && 'authenticated' in result ? fallback : target, {
            replace: true
        });
        return null;
    }

    return { complete };
}
