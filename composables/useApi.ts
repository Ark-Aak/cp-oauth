import type { FetchOptions } from 'ofetch';

type ApiOptions = Omit<FetchOptions<'json'>, 'headers'> & {
    headers?: HeadersInit;
    reauthToken?: string;
};
/** Untyped call signature: Nitro's per-route inference is too deep for dynamic URLs. */
type JsonFetch = <T>(url: string, options: FetchOptions<'json'>) => Promise<T>;

/**
 * Same-origin JSON client for first-party endpoints. Adds the CSRF marker the server
 * requires on unsafe methods, sends the session cookie, and forwards the incoming
 * cookie during SSR. Call it during setup; the returned function is safe in handlers.
 */
export function useApi() {
    const requestFetch = useRequestFetch() as unknown as JsonFetch;
    return function api<T = unknown>(url: string, options: ApiOptions = {}): Promise<T> {
        const { reauthToken, headers, ...rest } = options;
        const merged = new Headers(headers);
        merged.set('X-CP-OAuth-CSRF', '1');
        if (reauthToken) merged.set('X-CP-OAuth-Reauth', reauthToken);
        return requestFetch<T>(url, { ...rest, headers: merged, credentials: 'same-origin' });
    };
}
