/* eslint-disable @typescript-eslint/no-explicit-any */

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptLoadPromise: Promise<void> | null = null;

function ensureScript(): Promise<void> {
    if ((window as any).turnstile) return Promise.resolve();

    if (scriptLoadPromise) return scriptLoadPromise;

    scriptLoadPromise = new Promise<void>((resolve, reject) => {
        const existing = document.getElementById(SCRIPT_ID);
        if (existing) {
            // Script tag exists but hasn't finished loading yet
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Turnstile script failed')));
            // If it already loaded (race condition), turnstile will be on window
            if ((window as any).turnstile) resolve();
            return;
        }

        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Turnstile script failed'));
        document.head.appendChild(script);
    });

    return scriptLoadPromise;
}

export function useTurnstile(siteKey: Ref<string> | ComputedRef<string>) {
    const token = ref('');
    const el = ref<HTMLElement | null>(null);
    let widgetId: string | null = null;
    let mounted = false;

    function removeWidget() {
        token.value = '';

        if (import.meta.client && widgetId !== null && (window as any).turnstile) {
            try {
                (window as any).turnstile.remove(widgetId);
            } catch {
                // ignore
            }
        }

        widgetId = null;
    }

    async function render() {
        if (!import.meta.client || !mounted) return;

        if (!el.value || !siteKey.value) {
            removeWidget();
            return;
        }

        const target = el.value;
        const currentSiteKey = siteKey.value;

        try {
            await ensureScript();
        } catch {
            return;
        }

        const ts = (window as any).turnstile;
        if (!ts) return;

        if (el.value !== target || siteKey.value !== currentSiteKey) return;

        // Remove previous widget if exists
        removeWidget();

        widgetId = ts.render(target, {
            sitekey: currentSiteKey,
            callback: (t: string) => {
                token.value = t;
            },
            'expired-callback': () => {
                token.value = '';
            },
            'error-callback': () => {
                token.value = '';
            }
        });
    }

    function reset() {
        token.value = '';

        if (!import.meta.client) return;

        const ts = (window as any).turnstile;
        if (widgetId !== null && ts?.reset) {
            try {
                ts.reset(widgetId);
                return;
            } catch {
                // Fall back to rendering a fresh widget
            }
        }

        void render();
    }

    onMounted(async () => {
        mounted = true;
        await nextTick();
        void render();
    });

    watch(
        [el, siteKey],
        () => {
            if (mounted) void render();
        },
        { flush: 'post' }
    );

    onBeforeUnmount(() => {
        mounted = false;
        removeWidget();
    });

    return { token, el, reset };
}
