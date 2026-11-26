<template>
    <div v-if="config.capEnabled" class="cp-cap">
        <cap-widget
            v-if="ready"
            :key="capLang"
            ref="widget"
            class="cp-cap__widget"
            :data-cap-api-endpoint="endpoint"
            :data-cap-lang="capLang"
            @solve="onSolve"
            @error="onError"
            @reset="onReset"
        />
        <div v-else class="cp-cap__placeholder" aria-hidden="true" />
        <p v-if="failed" class="cp-cap__error" role="alert">
            {{ t('common.captcha.failed') }}
            <button type="button" class="cp-cap__retry" @click="reset">
                {{ t('common.actions.retry') }}
            </button>
        </p>
    </div>
</template>

<script setup lang="ts">
import type { CapErrorEvent, CapSolveEvent, CapWidget } from 'cap-widget';
import capWasmUrl from '@cap.js/wasm/browser/cap_wasm_bg.wasm?url';
import hashwxWasmUrl from '@cap.js/wasm/browser/hashwx.wasm?url';

let loadPromise: Promise<void> | null = null;

function ensureCapWidget(): Promise<void> {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
        window.CAP_CUSTOM_WASM_URL = capWasmUrl;
        window.CAP_CUSTOM_HASHWX_URL = hashwxWasmUrl;
        if (!window.CAP_CUSTOM_FETCH) {
            window.CAP_CUSTOM_FETCH = (input, init) => {
                const headers = new Headers(init?.headers);
                const url =
                    typeof input === 'string'
                        ? input
                        : input instanceof URL
                          ? input.href
                          : input.url;
                if (
                    url.startsWith('/api/cap/') ||
                    url.startsWith(`${window.location.origin}/api/cap/`)
                ) {
                    headers.set('X-CP-OAuth-CSRF', '1');
                }
                return window.fetch(input, { ...init, headers });
            };
        }
        await import('cap-widget');
    })().catch(error => {
        loadPromise = null;
        throw error;
    });
    return loadPromise;
}

const props = defineProps<{ action: 'login' | 'register' | 'luogu_challenge' }>();
const token = defineModel<string>({ default: '' });

const { t, locale } = useI18n();
const { config } = usePublicConfig();
const widget = ref<CapWidget | null>(null);
const ready = ref(false);
const failed = ref(false);

const endpoint = computed(() => `/api/cap/${props.action}/`);
const capLang = computed(() => (locale.value === 'zh' ? 'zh-cn' : locale.value));

async function mountWidget() {
    if (!config.value.capEnabled || ready.value) return;
    try {
        await ensureCapWidget();
        failed.value = false;
        ready.value = true;
    } catch {
        failed.value = true;
    }
}

function onSolve(event: Event) {
    const detail = (event as CapSolveEvent).detail;
    if (detail?.token) {
        failed.value = false;
        token.value = detail.token;
    }
}

function onError(_event: Event) {
    const _detail = (_event as CapErrorEvent).detail;
    token.value = '';
    failed.value = true;
}

function onReset() {
    token.value = '';
}

/** Tokens are single-use: call after every submission attempt. */
function reset() {
    token.value = '';
    failed.value = false;
    if (widget.value) {
        widget.value.reset();
    } else {
        void mountWidget();
    }
}

onMounted(() => {
    void mountWidget();
});

watch(
    () => config.value.capEnabled,
    enabled => {
        if (enabled) void mountWidget();
        else token.value = '';
    }
);

watch(capLang, () => {
    token.value = '';
});

defineExpose({ reset });
</script>

<style scoped lang="scss">
.cp-cap__widget {
    display: block;
    width: 100%;
    --cap-widget-width: 100%;
    --cap-widget-height: 56px;
    --cap-widget-padding: var(--cp-space-3);
    --cap-gap: var(--cp-space-3);
    --cap-background: var(--cp-surface);
    --cap-border-color: var(--cp-line-strong);
    --cap-border-radius: var(--cp-radius-md);
    --cap-color: var(--cp-text);
    --cap-checkbox-size: 24px;
    --cap-checkbox-border: 1px solid var(--cp-line-strong);
    --cap-checkbox-border-radius: var(--cp-radius-sm);
    --cap-checkbox-background: var(--cp-sunken);
    --cap-font: var(--cp-font-sans);
    --cap-spinner-color: var(--cp-accent);
    --cap-spinner-background-color: var(--cp-line);
    --cap-focus-ring: var(--cp-accent);
    --cap-troubleshoot-color: var(--cp-accent);
    --cap-invalid-border-color: var(--cp-danger);
    --cap-invalid-ring-color: var(--cp-danger-soft);
}

.cp-cap__placeholder {
    height: 56px;
    background: var(--cp-sunken);
    border: 1px solid var(--cp-line);
    border-radius: var(--cp-radius-md);
}

.cp-cap__error {
    margin-top: var(--cp-space-2);
    font-size: var(--cp-text-sm);
    color: var(--cp-danger);
}

.cp-cap__retry {
    padding: 0;
    margin-left: var(--cp-space-2);
    font: inherit;
    color: var(--cp-accent);
    text-decoration: underline;
    cursor: pointer;
    background: none;
    border: 0;
}
</style>
