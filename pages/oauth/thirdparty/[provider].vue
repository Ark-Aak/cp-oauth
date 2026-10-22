<template>
    <CpAuthScreen
        v-if="failure"
        :title="t('oauth.callback.failedTitle', { provider: providerName })"
        :description="failure"
        :icon="CircleAlert"
        tone="danger"
    >
        <el-button type="primary" @click="navigateTo(returnTo)">{{
            t('oauth.callback.return')
        }}</el-button>
    </CpAuthScreen>

    <CpAuthScreen
        v-else-if="mfa"
        :title="t('auth.mfa.title')"
        :description="t('auth.mfa.description')"
    >
        <CpMfaForm
            :challenge-id="mfa.challengeId"
            :method="mfa.method"
            @done="finish"
            @cancel="cancelMfa"
        />
    </CpAuthScreen>

    <CpAuthScreen
        v-else
        :title="t('oauth.callback.workingTitle', { provider: providerName })"
        :description="t('oauth.callback.workingText')"
    >
        <div class="callback" role="status" aria-live="polite">
            <CpPlatformMark :platform="provider" :label="false" :size="24" />
            <span class="callback__bar" aria-hidden="true" />
        </div>
    </CpAuthScreen>
</template>

<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next';
import type { PendingMfa } from '~/composables/useAuthFlow';
import type { AuthResult } from '~/types/auth';
import { PLATFORMS, type OAuthProvider } from '~/utils/platforms';

const PROVIDERS = ['github', 'google', 'codeforces', 'clist'];

definePageMeta({
    layout: 'auth',
    validate: route => PROVIDERS.includes(String(route.params.provider))
});

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { describe, read } = useApiError();
const { complete } = useAuthFlow();

const provider = computed(() => String(route.params.provider) as OAuthProvider);
const providerName = computed(() => PLATFORMS[provider.value].name);

useHead({ title: t('oauth.callback.pageTitle', { provider: providerName.value }) });

const query = (key: string) =>
    typeof route.query[key] === 'string' ? (route.query[key] as string) : '';

const failure = ref('');
const returnTo = ref('/login');
const mfa = ref<PendingMfa | null>(null);
let started = false;

if (query('error')) {
    failure.value =
        query('error') === 'access_denied'
            ? t('oauth.callback.denied', { provider: providerName.value })
            : query('error_description') ||
              t('oauth.callback.providerError', { code: query('error') });
} else if (!query('code') || !query('state')) {
    failure.value = t('oauth.callback.incomplete');
}

async function finish(result: AuthResult) {
    const pending = await complete(result, '/profile');
    if (pending) {
        mfa.value = pending;
        returnTo.value = getSafeRedirectTarget(pending.redirect, '/login');
    }
}

function cancelMfa() {
    mfa.value = null;
    failure.value = t('oauth.callback.mfaCancelled');
}

onMounted(async () => {
    if (failure.value || started) return;
    started = true;
    try {
        await finish(
            await api<AuthResult>(`/api/auth/thirdparty/${provider.value}/callback`, {
                method: 'POST',
                body: { code: query('code'), state: query('state') }
            })
        );
    } catch (cause) {
        const info = read(cause);
        returnTo.value = getSafeRedirectTarget(
            typeof info.data.redirect === 'string' ? info.data.redirect : undefined,
            '/login'
        );
        failure.value = describe(cause);
    }
});
</script>

<style scoped lang="scss">
.callback {
    display: flex;
    align-items: center;
    gap: var(--cp-space-4);
}

.callback__bar {
    flex: 1;
    height: 2px;
    background: linear-gradient(90deg, var(--cp-line), var(--cp-accent), var(--cp-line));
    background-size: 200% 100%;
    animation: callback-progress 1.2s linear infinite;
}

@keyframes callback-progress {
    from {
        background-position: 100% 0;
    }

    to {
        background-position: -100% 0;
    }
}
</style>
