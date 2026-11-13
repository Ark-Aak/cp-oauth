export type CaptchaProvider = 'turnstile' | 'cap';
export type CapAssetSource = 'jsdelivr' | 'unpkg' | 'self-hosted';

export interface CaptchaPolicy {
    turnstileEnabled: boolean;
    capEnabled: boolean;
    captchaPreferredProvider: CaptchaProvider;
    captchaAutoFailover: boolean;
}

/** Only enabled providers can be selected; without failover only the primary is accepted. */
export function captchaProviders(policy: CaptchaPolicy): CaptchaProvider[] {
    const enabled: CaptchaProvider[] = [];
    if (policy.turnstileEnabled) enabled.push('turnstile');
    if (policy.capEnabled) enabled.push('cap');
    if (enabled.includes(policy.captchaPreferredProvider)) {
        enabled.sort(a => (a === policy.captchaPreferredProvider ? -1 : 1));
    }
    return policy.captchaAutoFailover ? enabled : enabled.slice(0, 1);
}

/** HTTPS instance URL, with HTTP allowed for exact loopback development hosts. */
export function normalizeCapUrl(value: string): string {
    const url = new URL(value);
    if (
        (url.protocol !== 'https:' &&
            !(
                url.protocol === 'http:' &&
                ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            )) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    )
        throw new Error(
            'CAP requires an HTTPS instance URL without credentials, query or fragment'
        );
    return url.toString().replace(/\/+$/, '');
}

export function capEndpoint(instanceUrl: string, siteKey: string): string {
    return `${normalizeCapUrl(instanceUrl)}/${encodeURIComponent(siteKey)}/`;
}

// Pin CDN assets so a new upstream release cannot silently change authentication code.
export function capScriptUrl(source: CapAssetSource, instanceUrl: string): string {
    if (source === 'self-hosted') return `${normalizeCapUrl(instanceUrl)}/assets/widget.js`;
    if (source === 'unpkg') return 'https://unpkg.com/cap-widget@0.1.63';
    return 'https://cdn.jsdelivr.net/npm/cap-widget@0.1.63';
}

export function capWasmUrls(source: CapAssetSource, instanceUrl: string) {
    const base =
        source === 'self-hosted'
            ? `${normalizeCapUrl(instanceUrl)}/assets`
            : source === 'unpkg'
              ? 'https://unpkg.com/@cap.js/wasm@0.0.8/browser'
              : 'https://cdn.jsdelivr.net/npm/@cap.js/wasm@0.0.8/browser';
    return { wasm: `${base}/cap_wasm_bg.wasm`, hashwx: `${base}/hashwx.wasm` };
}
