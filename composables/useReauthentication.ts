import type { NuxtApp } from '#app';
import type { AuthResult, ReauthPurpose } from '~/types/auth';

type Proof = { token: string; expiresAt: number };
type ReauthenticationRuntime = {
    resolve: ((token: string | null) => void) | null;
    promise: Promise<string | null> | null;
};
type ReauthenticationApp = NuxtApp & {
    _cpReauthentication?: ReauthenticationRuntime;
};

export function useReauthentication() {
    const nuxtApp = useNuxtApp() as ReauthenticationApp;
    const open = useState<boolean>('reauth:open', () => false);
    const purpose = useState<ReauthPurpose | null>('reauth:purpose', () => null);
    const proofs = useState<Partial<Record<ReauthPurpose, Proof>>>('reauth:proofs', () => ({}));
    const confirmed = useState<boolean>('reauth:confirmed', () => false);
    const challenge = useState<{
        challengeId: string;
        method: 'email_otp' | 'totp';
        expiresAt: number;
    } | null>('reauth:mfa', () => null);
    const runtime = (nuxtApp._cpReauthentication ??= { resolve: null, promise: null });

    function settle(token: string | null) {
        const resolve = runtime.resolve;
        runtime.resolve = null;
        runtime.promise = null;
        open.value = false;
        purpose.value = null;
        challenge.value = null;
        resolve?.(token);
    }

    async function require(purposeValue: ReauthPurpose): Promise<string | null> {
        if (import.meta.server) return null;
        const proof = proofs.value[purposeValue];
        if (proof && proof.expiresAt > Date.now()) return proof.token;
        Reflect.deleteProperty(proofs.value, purposeValue);
        if (runtime.promise) {
            if (purpose.value === purposeValue) return runtime.promise;
            settle(null);
        }
        purpose.value = purposeValue;
        open.value = true;
        const { promise, resolve } = Promise.withResolvers<string | null>();
        runtime.resolve = resolve;
        runtime.promise = promise;
        return promise;
    }

    function accept(result: AuthResult) {
        if (import.meta.server) return false;
        if ('requiresTwoFactor' in result && purpose.value) {
            challenge.value = {
                challengeId: result.challengeId,
                method: result.method,
                expiresAt: Date.now() + 600_000
            };
            return true;
        }
        if (!('reauthToken' in result)) return false;
        proofs.value[result.purpose] = {
            token: result.reauthToken,
            expiresAt: Date.now() + result.expiresIn * 1000
        };
        confirmed.value = true;
        if (purpose.value === result.purpose) settle(result.reauthToken);
        return true;
    }

    function consume(purposeValue: ReauthPurpose, token?: string) {
        if (!token || proofs.value[purposeValue]?.token === token) {
            Reflect.deleteProperty(proofs.value, purposeValue);
        }
        confirmed.value = false;
    }

    function cancel() {
        settle(null);
    }

    function clear() {
        proofs.value = {};
        confirmed.value = false;
        settle(null);
    }

    return { require, accept, consume, cancel, clear, open, purpose, confirmed, challenge };
}
