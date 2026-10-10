<template>
    <section class="auth-card" aria-labelledby="oauth-callback-title" :aria-busy="pending">
        <h1 id="oauth-callback-title" class="auth-card__title">
            {{ $t('auth.login.with_provider', { provider: providerName }) }}
        </h1>
        <p v-if="pending" class="auth-card__status oauth-callback__pending" role="status">
            <LoaderCircle :size="18" aria-hidden="true" class="oauth-callback__spinner" />
            <span>{{ $t('auth.login.callback_loading', { provider: providerName }) }}</span>
        </p>
        <p
            v-else-if="errorMessage"
            ref="errorEl"
            class="auth-card__error"
            role="alert"
            tabindex="-1"
        >
            {{ errorMessage }}
        </p>
        <p v-else class="auth-card__status" role="status">
            {{ $t('auth.flow.callback_complete') }}
        </p>
        <NuxtLink
            v-if="errorMessage"
            :to="loginPath"
            class="el-button el-button--primary auth-card__button"
        >
            {{ $t('auth.password.back_login') }}
        </NuxtLink>
    </section>
</template>

<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next';
import type { AuthResult } from '~/types/auth';
import { buildLoginPath, getSafeRedirectTarget } from '~/utils/auth-redirect';

const props = defineProps<{ provider: 'github' | 'google' | 'codeforces' | 'clist' }>();
const { t } = useI18n();
const route = useRoute();
const api = useApi();
const { accept, takeRedirect } = useAuth();
const pending = ref(true);
const errorMessage = ref('');
const errorEl = ref<HTMLElement | null>(null);
const redirectTarget = ref(getSafeRedirectTarget(route.query.redirect));
const providerName = computed(() => t(`binding.platforms.${props.provider}`));
const loginPath = computed(() => buildLoginPath(redirectTarget.value));
let exchangeStarted = false;

useHead({
    title: () =>
        `${t('auth.login.with_provider', { provider: providerName.value })} - ${t('app.name')}`
});

function queryString(name: string): string {
    const value = route.query[name];
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === 'string' ? first : '';
}

async function showError(message: string) {
    pending.value = false;
    errorMessage.value = message;
    await nextTick();
    errorEl.value?.focus();
}

onMounted(async () => {
    if (exchangeStarted) return;
    exchangeStarted = true;
    const rememberedRedirect = takeRedirect(props.provider, redirectTarget.value);
    redirectTarget.value = getSafeRedirectTarget(route.query.redirect, rememberedRedirect);
    const providerError = queryString('error');
    const providerDescription = queryString('error_description');
    if (providerError || providerDescription) {
        await showError(
            t('auth.flow.provider_error', { error: providerDescription || providerError })
        );
        return;
    }
    const code = queryString('code');
    const state = queryString('state');
    if (!code || !state) {
        await showError(t('auth.login.callback_invalid'));
        return;
    }
    try {
        const result = await api<AuthResult>(`/api/auth/thirdparty/${props.provider}/callback`, {
            method: 'POST',
            body: { code, state }
        });
        redirectTarget.value = getSafeRedirectTarget(result.redirect, redirectTarget.value);
        await accept({ ...result, redirect: redirectTarget.value });
        pending.value = false;
    } catch (error) {
        const err = error as { data?: { message?: string; data?: { redirect?: string } } };
        redirectTarget.value = getSafeRedirectTarget(
            err.data?.data?.redirect,
            redirectTarget.value
        );
        await showError(err.data?.message || t('auth.login.error'));
    }
});
</script>

<style scoped lang="scss">
.oauth-callback {
    &__pending {
        display: flex;
        align-items: center;
        gap: var(--space-2);
    }

    &__spinner {
        flex-shrink: 0;
        color: var(--accent);
        animation: oauth-callback-spin 0.9s linear infinite;
    }
}

@keyframes oauth-callback-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .oauth-callback__spinner {
        animation: none;
    }
}
</style>
