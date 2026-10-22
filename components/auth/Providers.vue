<template>
    <div v-if="providers.length" class="auth-providers">
        <el-button
            v-for="provider in providers"
            :key="provider"
            class="auth-providers__button"
            :loading="busy === provider"
            :disabled="disabled || (busy !== null && busy !== provider)"
            @click="start(provider)"
        >
            <CpPlatformMark :platform="provider" :label="false" />
            <span>{{
                t('auth.providers.continueWith', { provider: PLATFORMS[provider].name })
            }}</span>
        </el-button>
        <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
    </div>
</template>

<script setup lang="ts">
import { OAUTH_PROVIDERS, PLATFORMS, type OAuthProvider } from '~/utils/platforms';

const props = defineProps<{
    mode: 'login' | 'register';
    redirect: string;
    /** Turnstile token for the same action as the surrounding form; required when enabled. */
    turnstileToken?: string;
    disabled?: boolean;
}>();
const emit = defineEmits<{ used: [] }>();

const { t } = useI18n();
const { describe } = useApiError();
const { config } = usePublicConfig();
const startProvider = useProviderStart();

const enabled: Record<OAuthProvider, () => boolean> = {
    github: () => config.value.githubLoginEnabled,
    google: () => config.value.googleLoginEnabled,
    codeforces: () => config.value.codeforcesLoginEnabled,
    clist: () => config.value.clistLoginEnabled
};
const providers = computed(() => OAUTH_PROVIDERS.filter(provider => enabled[provider]()));

const busy = ref<OAuthProvider | null>(null);
const error = ref('');

async function start(provider: OAuthProvider) {
    if (config.value.turnstileEnabled && !props.turnstileToken) {
        error.value = t('common.turnstile.required');
        return;
    }
    busy.value = provider;
    error.value = '';
    try {
        await startProvider(provider, {
            mode: props.mode,
            redirect: props.redirect,
            turnstileToken: props.turnstileToken || undefined
        });
    } catch (cause) {
        error.value = describe(cause);
        busy.value = null;
        emit('used');
    }
}
</script>

<style scoped lang="scss">
.auth-providers {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-2);
}

.auth-providers__button {
    justify-content: flex-start;
    width: 100%;
    margin-left: 0;

    :deep(> span) {
        display: inline-flex;
        align-items: center;
        gap: var(--cp-space-3);
    }
}
</style>
