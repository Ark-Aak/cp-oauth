import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
    toValue,
    type MaybeRef
} from 'vue';

type TurnstileApi = {
    render(element: HTMLElement, options: Record<string, unknown>): string;
    remove(id: string): void;
    reset(id: string): void;
};
const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptLoadPromise: Promise<void> | null = null;

function turnstileApi(): TurnstileApi | undefined {
    return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

function ensureScript(): Promise<void> {
    if (turnstileApi()) return Promise.resolve();
    if (scriptLoadPromise) return scriptLoadPromise;
    scriptLoadPromise = new Promise<void>((resolve, reject) => {
        const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        const script = existing || document.createElement('script');
        const fail = () => {
            scriptLoadPromise = null;
            script.remove();
            reject(new Error('Captcha could not be loaded'));
        };
        script.addEventListener('load', () => (turnstileApi() ? resolve() : fail()), {
            once: true
        });
        script.addEventListener('error', fail, { once: true });
        if (!existing) {
            script.id = SCRIPT_ID;
            script.src = SCRIPT_SRC;
            script.async = true;
            document.head.appendChild(script);
        }
    });
    return scriptLoadPromise;
}

export function useTurnstile(
    siteKey: MaybeRef<string>,
    options: { action?: MaybeRef<string> } = {}
) {
    const token = ref('');
    const el = ref<HTMLElement | null>(null);
    const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const error = ref<string | null>(null);
    const action = computed(() => toValue(options.action) || 'login');
    let widgetId: string | null = null;
    let mounted = false;
    let generation = 0;

    function removeWidget() {
        token.value = '';
        if (import.meta.client && widgetId !== null) {
            try {
                turnstileApi()?.remove(widgetId);
            } catch {
                /* Widget may have been removed by its host. */
            }
        }
        widgetId = null;
    }

    async function render() {
        if (!import.meta.client || !mounted) return;
        const id = ++generation;
        const target = el.value;
        const key = toValue(siteKey);
        removeWidget();
        error.value = null;
        if (!target || !key) {
            status.value = 'idle';
            return;
        }
        status.value = 'loading';
        try {
            await ensureScript();
            if (!mounted || id !== generation || el.value !== target || toValue(siteKey) !== key)
                return;
            const api = turnstileApi();
            if (!api) throw new Error('Captcha could not be loaded');
            widgetId = api.render(target, {
                sitekey: key,
                action: action.value,
                size: target.clientWidth < 300 ? 'compact' : 'normal',
                callback: (value: string) => {
                    token.value = value;
                    status.value = 'ready';
                    error.value = null;
                },
                'expired-callback': () => {
                    token.value = '';
                },
                'error-callback': () => {
                    token.value = '';
                    status.value = 'error';
                    error.value = 'Captcha verification is unavailable';
                }
            });
            status.value = 'ready';
        } catch {
            if (id !== generation || !mounted) return;
            token.value = '';
            status.value = 'error';
            error.value = 'Captcha could not be loaded';
        }
    }

    function reset() {
        token.value = '';
        if (!import.meta.client) return;
        if (widgetId !== null && status.value === 'ready') {
            try {
                turnstileApi()?.reset(widgetId);
                return;
            } catch {
                /* Recreate a stale widget. */
            }
        }
        void render();
    }

    async function retry() {
        if (!import.meta.client) return;
        if (!turnstileApi()) {
            scriptLoadPromise = null;
            document.getElementById(SCRIPT_ID)?.remove();
        }
        await render();
    }

    onMounted(async () => {
        mounted = true;
        await nextTick();
        await render();
    });
    watch(
        [el, () => toValue(siteKey), action],
        () => {
            if (mounted) void render();
        },
        { flush: 'post' }
    );
    onBeforeUnmount(() => {
        mounted = false;
        generation += 1;
        removeWidget();
    });
    return { token, el, status, error, reset, retry };
}
