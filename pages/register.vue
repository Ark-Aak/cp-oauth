<template>
    <el-card class="register-card" shadow="never">
        <p class="register-card__brand">{{ siteTitle }}</p>
        <h1 class="register-card__title">{{ $t('auth.register.title') }}</h1>
        <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-position="top"
            @submit.prevent="handleRegister"
        >
            <el-form-item prop="username">
                <el-input
                    v-model="form.username"
                    :placeholder="$t('auth.register.username')"
                    size="large"
                />
            </el-form-item>
            <el-form-item prop="email">
                <el-input
                    v-model="form.email"
                    type="email"
                    :placeholder="$t('auth.register.email')"
                    size="large"
                />
            </el-form-item>
            <el-form-item prop="password">
                <el-input
                    v-model="form.password"
                    type="password"
                    :placeholder="$t('auth.register.password')"
                    size="large"
                    show-password
                />
            </el-form-item>
            <div v-if="turnstileEnabled" ref="turnstileEl" class="register-card__turnstile" />
            <el-form-item>
                <el-button
                    type="primary"
                    native-type="submit"
                    :loading="loading"
                    size="large"
                    class="register-card__btn"
                >
                    {{ loading ? $t('auth.register.loading') : $t('auth.register.submit') }}
                </el-button>
            </el-form-item>
        </el-form>

        <p class="register-card__footer">
            {{ $t('auth.register.footer') }}
            <NuxtLink to="/login">{{ $t('auth.register.login_link') }}</NuxtLink>
        </p>
    </el-card>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { isValidUsername, normalizeUsername } from '~/utils/username';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();

interface PublicConfigResponse {
    siteTitle?: string;
    turnstileEnabled?: boolean;
    turnstileSiteKey?: string;
}

useHead({ title: () => `${t('auth.register.title')} - CP OAuth` });
const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
    username: '',
    email: '',
    password: ''
});

const rules = computed<FormRules>(() => ({
    username: [
        { required: true, message: t('auth.register.username'), trigger: 'blur' },
        {
            validator: (_rule, value: string, callback) => {
                if (!isValidUsername(normalizeUsername(value))) {
                    callback(new Error(t('profile.username_invalid')));
                    return;
                }
                callback();
            },
            trigger: 'blur'
        }
    ],
    email: [{ required: true, message: t('auth.register.email'), trigger: 'blur' }],
    password: [{ required: true, message: t('auth.register.password'), trigger: 'blur' }]
}));

const { data: publicConfig } = await useFetch<PublicConfigResponse>('/api/public/config');
const siteTitle = computed(() => publicConfig.value?.siteTitle || t('app.name'));
const turnstileEnabled = computed(() => publicConfig.value?.turnstileEnabled || false);
const turnstileSiteKey = computed(() => publicConfig.value?.turnstileSiteKey || '');
const { token: turnstileToken, el: turnstileEl } = useTurnstile(turnstileSiteKey);

async function handleRegister() {
    if (!formRef.value) return;
    const valid = await formRef.value.validate().catch(() => false);
    if (!valid) return;

    loading.value = true;
    try {
        const data = await $fetch('/api/auth/register', {
            method: 'POST',
            body: {
                username: normalizeUsername(form.username),
                email: form.email,
                password: form.password,
                turnstileToken: turnstileToken.value || undefined
            }
        });
        useCookie('auth_token', { maxAge: 7 * 24 * 60 * 60 }).value = data.token;
        await navigateTo('/');
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.register.error'));
    } finally {
        loading.value = false;
    }
}
</script>

<style scoped lang="scss">
.register-card {
    width: 100%;
    max-width: 380px;
    border: 1px solid var(--border-color);

    &__brand {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-muted);
        letter-spacing: -0.01em;
        margin-bottom: 14px;
    }

    &__title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 20px;
        color: var(--text-primary);
    }

    &__turnstile {
        display: flex;
        justify-content: center;
        margin: 4px 0 14px;
    }

    &__btn {
        width: 100%;
    }

    &__footer {
        margin-top: 6px;
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
