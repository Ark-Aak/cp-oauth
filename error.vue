<template>
    <NuxtLayout :name="layout">
        <div class="error-page">
            <p class="cp-kicker cp-num">{{ status }}</p>
            <h1 class="error-page__title">{{ heading }}</h1>
            <p class="error-page__text">{{ detail }}</p>
            <div class="error-page__actions">
                <el-button type="primary" @click="handleError({ redirect: '/' })">
                    {{ t('common.errorPage.home') }}
                </el-button>
                <el-button
                    v-if="status === 403 || status === 401"
                    @click="handleError({ redirect: '/login' })"
                >
                    {{ t('common.actions.signIn') }}
                </el-button>
            </div>
        </div>
    </NuxtLayout>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app';

const props = defineProps<{ error: NuxtError }>();
const { t } = useI18n();
const { user } = useSession();

const status = computed(() => props.error.statusCode || 500);
const layout = computed(() => (user.value ? 'default' : 'auth'));
const heading = computed(() => {
    if (status.value === 404) return t('common.errorPage.notFound');
    if (status.value === 403) return t('common.errorPage.forbidden');
    if (status.value === 503) return t('common.errorPage.unavailable');
    return t('common.errorPage.generic');
});
const detail = computed(() => {
    if (status.value === 404) return t('common.errorPage.notFoundText');
    if (status.value === 403) return t('common.errorPage.forbiddenText');
    return props.error.statusMessage || t('common.errorPage.genericText');
});

useHead({ title: heading });

const handleError = (options: { redirect: string }) => clearError(options);
</script>

<style scoped lang="scss">
.error-page {
    max-width: 560px;
    padding: var(--cp-space-12) 0;
}

.error-page__title {
    margin-top: var(--cp-space-2);
    font-size: var(--cp-text-2xl);
    line-height: var(--cp-leading-2xl);
    font-weight: var(--cp-weight-strong);
}

.error-page__text {
    margin-top: var(--cp-space-2);
    color: var(--cp-text-2);
}

.error-page__actions {
    display: flex;
    gap: var(--cp-space-2);
    margin-top: var(--cp-space-6);

    :deep(.el-button + .el-button) {
        margin-left: 0;
    }
}
</style>
