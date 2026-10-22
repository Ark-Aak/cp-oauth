import type { ReauthPurpose } from '~/types/auth';

interface StoredProof {
    token: string;
    expiresAt: number;
}

const storageKey = (purpose: ReauthPurpose) => `cp-reauth:${purpose}`;
let pending: ((token: string | null) => void) | null = null;

/**
 * Fresh identity proofs for sensitive changes. `request()` opens `CpReauthDialog`
 * (mounted by the default layout) and resolves with a single-use proof, or `null`
 * when the user cancels. Proofs obtained through an external provider round trip are
 * parked in sessionStorage by `storeProof()` and consumed by the next `request()`.
 */
export function useReauth() {
    const dialog = useState('cp-reauth-dialog', () => ({
        open: false,
        purpose: null as ReauthPurpose | null
    }));

    function takeStoredProof(purpose: ReauthPurpose): string | null {
        if (typeof sessionStorage === 'undefined') return null;
        const raw = sessionStorage.getItem(storageKey(purpose));
        if (!raw) return null;
        sessionStorage.removeItem(storageKey(purpose));
        try {
            const proof = JSON.parse(raw) as StoredProof;
            return proof.expiresAt > Date.now() + 5000 ? proof.token : null;
        } catch {
            return null;
        }
    }

    function request(purpose: ReauthPurpose): Promise<string | null> {
        const stored = takeStoredProof(purpose);
        if (stored) return Promise.resolve(stored);
        pending?.(null);
        dialog.value = { open: true, purpose };
        const { promise, resolve } = Promise.withResolvers<string | null>();
        pending = resolve;
        return promise;
    }

    /** Called by the dialog with a proof, or `null` on cancel. */
    function complete(token: string | null) {
        dialog.value = { open: false, purpose: dialog.value.purpose };
        const resolve = pending;
        pending = null;
        resolve?.(token);
    }

    function storeProof(result: {
        reauthToken: string;
        purpose: ReauthPurpose;
        expiresIn: number;
    }) {
        const proof: StoredProof = {
            token: result.reauthToken,
            expiresAt: Date.now() + result.expiresIn * 1000
        };
        sessionStorage.setItem(storageKey(result.purpose), JSON.stringify(proof));
    }

    return { dialog, request, complete, storeProof };
}
