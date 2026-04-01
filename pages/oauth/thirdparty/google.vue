<template>
    <el-card class="oauth-callback-card" shadow="never">
        <h1 class="oauth-callback-card__title">{{ $t('auth.login.google_callback_title') }}</h1>

        <div v-if="loading" class="oauth-callback-card__status">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>{{ $t('auth.login.google_callback_loading') }}</span>
        </div>

        <el-alert
            v-else-if="errorMessage"
            :title="errorMessage"
            type="error"
            show-icon
            :closable="false"
        />

        <el-alert
            v-else
            :title="$t('auth.login.google_callback_success')"
            type="success"
            show-icon
            :closable="false"
        />

        <el-button
            v-if="errorMessage"
            class="oauth-callback-card__back"
            @click="navigateTo('/login')"
        >
            {{ $t('nav.login') }}
        </el-button>
    </el-card>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { Loading } from '@element-plus/icons-vue';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
useHead({ title: () => `${t('auth.login.google_callback_title')} - CP OAuth` });

const route = useRoute();
const loading = ref(true);
const errorMessage = ref('');

const oauthError = computed(() => {
    const value = route.query.error;
    return typeof value === 'string' ? value : '';
});
const oauthCode = computed(() => {
    const value = route.query.code;
    return typeof value === 'string' ? value : '';
});
const oauthState = computed(() => {
    const value = route.query.state;
    return typeof value === 'string' ? value : '';
});

async function finishGoogleLogin() {
    if (oauthError.value) {
        errorMessage.value = oauthError.value;
        loading.value = false;
        return;
    }

    if (!oauthCode.value || !oauthState.value) {
        errorMessage.value = t('auth.login.google_callback_invalid');
        loading.value = false;
        return;
    }

    try {
        const result = await $fetch<{
            mode?: 'login' | 'bind' | 'register';
            token?: string;
            redirect?: string;
        }>('/api/auth/thirdparty/google/callback', {
            method: 'POST',
            body: {
                code: oauthCode.value,
                state: oauthState.value
            }
        });

        if (result.mode === 'bind') {
            ElMessage.success(t('binding.google_bind_success'));
        }

        if (result.token) {
            useCookie('auth_token', { maxAge: 7 * 24 * 60 * 60 }).value = result.token;
        }
        await navigateTo(result.redirect || '/');
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        errorMessage.value = err.data?.message || t('auth.login.error');
        ElMessage.error(errorMessage.value);
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    void finishGoogleLogin();
});
</script>

<style scoped lang="scss">
.oauth-callback-card {
    width: 100%;
    max-width: 400px;
    border: 1px solid var(--border-color);

    &__title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 16px;
        color: var(--text-primary);
    }

    &__status {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-muted);
        font-size: 13px;
        margin-bottom: 14px;
    }

    &__back {
        margin-top: 14px;
        width: 100%;
    }
}
</style>
