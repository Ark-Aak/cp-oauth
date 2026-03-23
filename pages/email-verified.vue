<template>
    <el-card class="verified-card" shadow="never">
        <h1 class="verified-card__title">
            {{
                isSuccess
                    ? $t('auth.verify_result.success_title')
                    : $t('auth.verify_result.error_title')
            }}
        </h1>
        <p class="verified-card__desc">
            {{
                isSuccess
                    ? $t('auth.verify_result.success_desc')
                    : $t('auth.verify_result.error_desc')
            }}
        </p>

        <div class="verified-card__actions">
            <el-button type="primary" @click="goLogin">
                {{ $t('auth.verify_result.go_login') }}
            </el-button>
            <el-button @click="closeTab">
                {{ $t('auth.verify_result.close_tab') }}
            </el-button>
        </div>
        <p class="verified-card__hint">{{ $t('auth.verify_result.close_hint') }}</p>
    </el-card>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const route = useRoute();
const isSuccess = computed(() => route.query.status === 'success');

useHead({
    title: () =>
        isSuccess.value
            ? `${t('auth.verify_result.success_title')} - CP OAuth`
            : `${t('auth.verify_result.error_title')} - CP OAuth`
});

function goLogin() {
    navigateTo('/login');
}

function closeTab() {
    window.close();
}
</script>

<style scoped lang="scss">
.verified-card {
    width: 100%;
    max-width: 460px;
    border: 1px solid var(--border-color);

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--text-primary);
    }

    &__desc {
        font-size: 14px;
        color: var(--text-secondary);
        line-height: 1.6;
        margin-bottom: 18px;
    }

    &__actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    &__hint {
        margin-top: 12px;
        font-size: 12px;
        color: var(--text-muted);
    }
}
</style>
