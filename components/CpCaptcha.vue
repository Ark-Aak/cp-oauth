<template>
    <div v-if="config.captchaEnabled" class="cp-captcha">
        <div ref="container" class="cp-captcha__widget" />
        <p v-if="switched" class="cp-help" role="status">
            {{
                t('common.captcha.switched', {
                    provider: active === 'cap' ? 'CAP' : 'Cloudflare Turnstile'
                })
            }}
        </p>
        <p v-if="failed" class="cp-captcha__error" role="alert">
            {{ t('common.turnstile.failed') }}
            <button type="button" class="cp-captcha__retry" @click="retry">
                {{ t('common.actions.retry') }}
            </button>
        </p>
    </div>
</template>

<script setup lang="ts">
import {
    captchaProviders,
    capEndpoint,
    capScriptUrl,
    capWasmUrls,
    type CaptchaProvider
} from '~/utils/captcha';
import { loadCaptchaScript } from '~/utils/captcha-script';

const props = defineProps<{ action: string }>();
const token = defineModel<string>({ default: '' });
const { t, locale } = useI18n();
const colorMode = useColorMode();
const { config } = usePublicConfig();
const container = ref<HTMLElement | null>(null);
const providers = computed(() => captchaProviders(config.value));
const active = ref<CaptchaProvider | undefined>(providers.value[0]);
const failed = ref(false);
const switched = ref(false);
const unavailable = new Set<CaptchaProvider>();
let widgetId: string | undefined;
let generation = 0;
let mounted = false;

function destroy() {
    generation++;
    if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    widgetId = undefined;
    container.value?.replaceChildren();
}

function fail(provider: CaptchaProvider, allowFailover = true) {
    if (active.value !== provider) return;
    token.value = '';
    unavailable.add(provider);
    const next = allowFailover ? providers.value.find(item => !unavailable.has(item)) : undefined;
    if (next) {
        active.value = next;
        switched.value = true;
        void render();
    } else {
        failed.value = true;
    }
}

async function render() {
    if (!mounted) return;
    destroy();
    token.value = '';
    failed.value = false;
    const provider = active.value;
    if (!config.value.captchaEnabled || !provider || !container.value) return;
    const current = generation;
    const live = () => mounted && current === generation && active.value === provider;
    try {
        if (provider === 'turnstile') {
            await loadCaptchaScript(
                'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
                () => !!window.turnstile
            );
            if (!live() || !container.value || !window.turnstile) return;
            widgetId = window.turnstile.render(container.value, {
                sitekey: config.value.turnstileSiteKey,
                action: props.action,
                theme: colorMode.value === 'dark' ? 'dark' : 'light',
                language: locale.value === 'zh' ? 'zh-cn' : locale.value,
                size: 'flexible',
                callback: value => {
                    if (live()) {
                        failed.value = false;
                        token.value = value;
                    }
                },
                'expired-callback': () => {
                    if (live()) token.value = '';
                },
                'error-callback': () => {
                    if (live()) fail(provider);
                },
                'timeout-callback': () => {
                    if (live()) fail(provider);
                }
            });
        } else {
            const assets = capWasmUrls(config.value.capAssetSource, config.value.capInstanceUrl);
            window.CAP_CUSTOM_WASM_URL = assets.wasm;
            window.CAP_CUSTOM_HASHWX_URL = assets.hashwx;
            window.CAP_PAKO_URL =
                config.value.capAssetSource === 'unpkg'
                    ? 'https://unpkg.com/pako@2.1.0/dist/pako_inflate.min.js'
                    : undefined;
            await loadCaptchaScript(
                capScriptUrl(config.value.capAssetSource, config.value.capInstanceUrl),
                () => !!customElements.get('cap-widget')
            );
            if (!live() || !container.value) return;
            const widget = document.createElement('cap-widget');
            widget.setAttribute(
                'data-cap-api-endpoint',
                capEndpoint(config.value.capInstanceUrl, config.value.capSiteKey)
            );
            widget.setAttribute('data-cap-lang', locale.value);
            widget.addEventListener('solve', event => {
                const value: unknown = (event as CustomEvent<{ token: unknown }>).detail?.token;
                if (live() && typeof value === 'string' && value) {
                    failed.value = false;
                    token.value = `cap:${value}`;
                }
            });
            widget.addEventListener('reset', () => {
                if (live()) token.value = '';
            });
            widget.addEventListener('error', (event: Event) => {
                if (!live()) return;
                const code = (event as CustomEvent<{ code?: string }>).detail?.code;
                // Do not treat a rejected solution or an anti-bot decision as an outage.
                fail(
                    provider,
                    [
                        'network_error',
                        'challenge_parse_error',
                        'challenge_unsupported',
                        'redeem_failed'
                    ].includes(code ?? '')
                );
            });
            container.value.appendChild(widget);
        }
    } catch {
        if (live()) fail(provider);
    }
}

function onUnavailable(event: Event) {
    const detail = (
        event as CustomEvent<{ provider?: CaptchaProvider; fallbackProvider?: CaptchaProvider }>
    ).detail;
    if (detail?.provider === active.value && detail.provider)
        fail(detail.provider, !!detail.fallbackProvider);
}

/** Reset single-use tokens after each submission, retaining the selected fallback. */
function reset() {
    void render();
}
function retry() {
    unavailable.clear();
    switched.value = false;
    active.value = providers.value[0];
    void render();
}

onMounted(() => {
    mounted = true;
    window.addEventListener('cp:captcha-unavailable', onUnavailable);
    void render();
});
watch(() => [colorMode.value, locale.value, props.action], reset);
watch(
    () => [
        config.value.turnstileEnabled,
        config.value.capEnabled,
        config.value.turnstileSiteKey,
        config.value.capInstanceUrl,
        config.value.capSiteKey,
        config.value.capAssetSource,
        config.value.captchaPreferredProvider,
        config.value.captchaAutoFailover
    ],
    retry
);
onBeforeUnmount(() => {
    mounted = false;
    window.removeEventListener('cp:captcha-unavailable', onUnavailable);
    destroy();
});
defineExpose({ reset });
</script>

<style scoped lang="scss">
.cp-captcha__widget {
    min-height: 65px;
}
.cp-captcha__widget :deep(cap-widget) {
    --cap-background: var(--cp-surface);
    --cap-color: var(--cp-text);
    --cap-border-color: var(--cp-border);
    --cap-font: var(--cp-font-sans);
}
.cp-captcha__error {
    margin-top: var(--cp-space-2);
    font-size: var(--cp-text-sm);
    color: var(--cp-danger);
}
.cp-captcha__retry {
    padding: 0;
    margin-left: var(--cp-space-2);
    font: inherit;
    color: var(--cp-accent);
    background: none;
    border: 0;
    cursor: pointer;
    text-decoration: underline;
}
</style>
