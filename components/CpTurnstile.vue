<template>
    <div v-if="config.turnstileEnabled" class="cp-turnstile">
        <div ref="container" class="cp-turnstile__widget" />
        <p v-if="failed" class="cp-turnstile__error" role="alert">
            {{ t('common.turnstile.failed') }}
            <button type="button" class="cp-turnstile__retry" @click="reset">
                {{ t('common.actions.retry') }}
            </button>
        </p>
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{ action: string }>();
const token = defineModel<string>({ default: '' });

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const { t, locale } = useI18n();
const colorMode = useColorMode();
const { config } = usePublicConfig();
const container = ref<HTMLElement | null>(null);
const failed = ref(false);
let widgetId: string | undefined;

function loadScript(): Promise<void> {
    if (window.turnstile) return Promise.resolve();
    const { promise, resolve, reject } = Promise.withResolvers<undefined>();
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
        script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve(undefined), { once: true });
    script.addEventListener('error', () => reject(new Error('turnstile')), { once: true });
    return promise;
}

async function render() {
    if (!config.value.turnstileEnabled || !container.value) return;
    try {
        await loadScript();
    } catch {
        failed.value = true;
        return;
    }
    if (!window.turnstile || !container.value) return;
    if (widgetId) window.turnstile.remove(widgetId);
    widgetId = window.turnstile.render(container.value, {
        sitekey: config.value.turnstileSiteKey,
        action: props.action,
        theme: colorMode.value === 'dark' ? 'dark' : 'light',
        language: locale.value === 'zh' ? 'zh-cn' : locale.value,
        size: 'flexible',
        callback: value => {
            failed.value = false;
            token.value = value;
        },
        'expired-callback': () => {
            token.value = '';
        },
        'error-callback': () => {
            token.value = '';
            failed.value = true;
        },
        'timeout-callback': () => {
            token.value = '';
        }
    });
}

/** Tokens are single-use: call after every submission attempt. */
function reset() {
    token.value = '';
    failed.value = false;
    if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
    else void render();
}

onMounted(render);
watch(() => colorMode.value, render);
onBeforeUnmount(() => {
    if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
});

defineExpose({ reset });
</script>

<style scoped lang="scss">
.cp-turnstile__widget {
    min-height: 65px;
}

.cp-turnstile__error {
    margin-top: var(--cp-space-2);
    font-size: var(--cp-text-sm);
    color: var(--cp-danger);
}

.cp-turnstile__retry {
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
