<template>
    <el-card class="login-card" shadow="never">
        <p class="login-card__brand">{{ siteTitle }}</p>
        <h1 class="login-card__title">{{ $t('auth.login.title') }}</h1>
        <el-alert
            v-if="verified"
            :title="$t('auth.login.verified')"
            type="success"
            show-icon
            :closable="false"
            class="login-card__alert"
        />
        <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-position="top"
            @submit.prevent="handleLogin"
        >
            <el-form-item prop="email">
                <el-input
                    v-model="form.email"
                    type="email"
                    :placeholder="$t('auth.login.email')"
                    size="large"
                />
            </el-form-item>
            <el-form-item prop="password">
                <el-input
                    v-model="form.password"
                    type="password"
                    :placeholder="$t('auth.login.password')"
                    size="large"
                    show-password
                />
            </el-form-item>
            <div v-if="turnstileEnabled" ref="turnstileEl" class="login-card__turnstile" />
            <el-form-item>
                <el-button
                    type="primary"
                    native-type="submit"
                    :loading="loading"
                    size="large"
                    class="login-card__btn"
                >
                    {{ loading ? $t('auth.login.loading') : $t('auth.login.submit') }}
                </el-button>
            </el-form-item>
        </el-form>

        <div v-if="codeforcesLoginEnabled" class="login-card__oauth">
            <el-divider>{{ $t('auth.login.oauth_divider') }}</el-divider>
            <el-button
                class="login-card__oauth-btn"
                :loading="codeforcesLoading"
                @click="handleCodeforcesLogin"
            >
                {{ $t('auth.login.with_codeforces') }}
            </el-button>
        </div>

        <p class="login-card__footer">
            {{ $t('auth.login.footer') }}
            <NuxtLink to="/register">{{ $t('auth.login.register_link') }}</NuxtLink>
        </p>
    </el-card>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();

useHead({ title: () => `${t('auth.login.title')} - CP OAuth` });
const route = useRoute();
const formRef = ref<FormInstance>();
const loading = ref(false);
const codeforcesLoading = ref(false);
const verified = computed(() => route.query.verified === 'true');
const redirectTarget = computed(() => getSafeRedirectTarget(route.query.redirect));

interface PublicConfigResponse {
    siteTitle?: string;
    turnstileEnabled?: boolean;
    turnstileSiteKey?: string;
    codeforcesLoginEnabled?: boolean;
}

const form = reactive({
    email: '',
    password: ''
});

const rules = computed<FormRules>(() => ({
    email: [{ required: true, message: t('auth.login.email'), trigger: 'blur' }],
    password: [{ required: true, message: t('auth.login.password'), trigger: 'blur' }]
}));

const { data: publicConfig } = await useFetch<PublicConfigResponse>('/api/public/config');
const siteTitle = computed(() => publicConfig.value?.siteTitle || t('app.name'));
const turnstileEnabled = computed(() => publicConfig.value?.turnstileEnabled || false);
const turnstileSiteKey = computed(() => publicConfig.value?.turnstileSiteKey || '');
const codeforcesLoginEnabled = computed(() => publicConfig.value?.codeforcesLoginEnabled || false);
const { token: turnstileToken, el: turnstileEl } = useTurnstile(turnstileSiteKey);

async function handleLogin() {
    if (!formRef.value) return;
    const valid = await formRef.value.validate().catch(() => false);
    if (!valid) return;

    loading.value = true;
    try {
        const data = await $fetch('/api/auth/login', {
            method: 'POST',
            body: {
                email: form.email,
                password: form.password,
                turnstileToken: turnstileToken.value || undefined
            }
        });
        useCookie('auth_token').value = data.token;
        navigateTo(redirectTarget.value);
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        loading.value = false;
    }
}

async function handleCodeforcesLogin() {
    codeforcesLoading.value = true;
    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/codeforces/start',
            {
                query: {
                    redirect: redirectTarget.value
                }
            }
        );
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        codeforcesLoading.value = false;
    }
}
</script>

<style scoped lang="scss">
.login-card {
    width: 100%;
    max-width: 400px;
    border: 1px solid var(--border-color);

    &__brand {
        font-size: 15px;
        font-weight: 600;
        color: var(--accent);
        letter-spacing: -0.02em;
        margin-bottom: 16px;
    }

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 24px;
        color: var(--text-primary);
    }

    &__alert {
        margin-bottom: 16px;
    }

    &__turnstile {
        display: flex;
        justify-content: center;
        margin: 4px 0 16px;
    }

    &__btn {
        width: 100%;
    }

    &__oauth {
        margin-bottom: 8px;
    }

    &__oauth-btn {
        width: 100%;
    }

    &__footer {
        margin-top: 8px;
        text-align: center;
        font-size: 13px;
        color: var(--text-muted);

        a {
            color: var(--text-primary);
            text-decoration: underline;
        }
    }
}
</style>
