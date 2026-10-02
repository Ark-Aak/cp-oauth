<template>
    <el-card class="auth-card" shadow="never">
        <p class="auth-card__brand">{{ siteTitle }}</p>
        <h1 class="auth-card__title">{{ $t(titleKey) }}</h1>
        <p class="auth-card__desc" :role="outcome === 'success' ? 'status' : 'alert'">
            {{ $t(descriptionKey) }}
        </p>
        <p v-if="identityError" ref="errorEl" class="auth-card__error" role="alert" tabindex="-1">
            {{ identityError }}
        </p>
        <div class="auth-card__actions">
            <NuxtLink :to="redirectTarget" class="auth-card__link">
                {{ $t('auth.flow.return_task') }}
            </NuxtLink>
            <NuxtLink :to="loginPath" class="auth-card__link">
                {{ $t('auth.verify_result.go_login') }}
            </NuxtLink>
            <NuxtLink v-if="outcome !== 'success'" :to="verificationPath" class="auth-card__link">
                {{ $t('auth.flow.verification_request_again') }}
            </NuxtLink>
        </div>
    </el-card>
</template>

<script setup lang="ts">
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const route = useRoute();
const { load, clearPending } = useAuth();
const { data: publicConfig } = await usePublicConfig();
const siteTitle = computed(() => publicConfig.value?.siteTitle || t('app.name'));
const redirectTarget = computed(() => getSafeRedirectTarget(route.query.redirect));
const outcome = computed(() => {
    const value = Array.isArray(route.query.status) ? route.query.status[0] : route.query.status;
    return value === 'success' || value === 'expired' || value === 'conflict' ? value : 'error';
});
const titleKey = computed(
    () =>
        ({
            success: 'auth.verify_result.success_title',
            error: 'auth.verify_result.error_title',
            expired: 'auth.flow.verification_expired_title',
            conflict: 'auth.flow.verification_conflict_title'
        })[outcome.value]
);
const descriptionKey = computed(
    () =>
        ({
            success: 'auth.flow.verification_success',
            error: 'auth.verify_result.error_desc',
            expired: 'auth.flow.verification_expired',
            conflict: 'auth.flow.verification_conflict'
        })[outcome.value]
);
const loginPath = computed(() => ({
    path: '/login',
    query: {
        redirect: redirectTarget.value,
        ...(outcome.value === 'success' ? { verified: 'true' } : {})
    }
}));
const verificationPath = computed(() => ({
    path: '/profile',
    query: { tab: 'basic', redirect: redirectTarget.value }
}));
const identityError = ref('');
const errorEl = ref<HTMLElement | null>(null);

if (import.meta.server && outcome.value === 'conflict') {
    const event = useRequestEvent();
    if (event) event.node.res.statusCode = 409;
}
useHead({ title: () => `${t(titleKey.value)} - ${siteTitle.value}` });
watch(identityError, async message => {
    if (!message) return;
    await nextTick();
    errorEl.value?.focus();
});
onMounted(async () => {
    if (outcome.value !== 'success') return;
    clearPending();
    try {
        await load(true);
    } catch {
        identityError.value = t('identity.identity_unavailable');
    }
});
</script>
