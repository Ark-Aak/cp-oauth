<template>
    <el-card class="login-card" shadow="never">
        <p class="login-card__brand">{{ siteTitle }}</p>
        <h1 class="login-card__title">{{ $t('auth.register.title') }}</h1>
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
            <div v-if="turnstileEnabled" ref="turnstileEl" class="login-card__turnstile" />
            <el-form-item>
                <el-button
                    type="primary"
                    native-type="submit"
                    :loading="loading"
                    size="large"
                    class="login-card__btn"
                >
                    {{ loading ? $t('auth.register.loading') : $t('auth.register.submit') }}
                </el-button>
            </el-form-item>
        </el-form>
        <p class="login-card__footer">
            {{ $t('auth.register.footer') }}
            <NuxtLink to="/login">{{ $t('auth.register.login_link') }}</NuxtLink>
        </p>
    </el-card>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const formRef = ref<FormInstance>();
const loading = ref(false);
const turnstileToken = ref('');
const turnstileEl = ref<HTMLElement>();

const form = reactive({
    username: '',
    email: '',
    password: ''
});

const rules = computed<FormRules>(() => ({
    username: [{ required: true, message: t('auth.register.username'), trigger: 'blur' }],
    email: [{ required: true, message: t('auth.register.email'), trigger: 'blur' }],
    password: [{ required: true, message: t('auth.register.password'), trigger: 'blur' }]
}));

const { data: publicConfig } = await useFetch('/api/public/config');
const siteTitle = computed(() => publicConfig.value?.siteTitle || t('app.name'));
const turnstileEnabled = computed(() => publicConfig.value?.turnstileEnabled || false);
const turnstileSiteKey = computed(() => publicConfig.value?.turnstileSiteKey || '');

onMounted(() => {
    if (turnstileEnabled.value && turnstileSiteKey.value) {
        loadTurnstile();
    }
});

function loadTurnstile() {
    if (document.getElementById('cf-turnstile-script')) return;
    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.onload = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (turnstileEl.value && (window as any).turnstile) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).turnstile.render(turnstileEl.value, {
                sitekey: turnstileSiteKey.value,
                callback: (token: string) => {
                    turnstileToken.value = token;
                }
            });
        }
    };
    document.head.appendChild(script);
}

async function handleRegister() {
    if (!formRef.value) return;
    const valid = await formRef.value.validate().catch(() => false);
    if (!valid) return;

    loading.value = true;
    try {
        const data = await $fetch('/api/auth/register', {
            method: 'POST',
            body: {
                username: form.username,
                email: form.email,
                password: form.password,
                turnstileToken: turnstileToken.value || undefined
            }
        });
        useCookie('auth_token').value = data.token;
        navigateTo('/');
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.register.error'));
    } finally {
        loading.value = false;
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

    &__turnstile {
        margin: 4px 0 16px;
    }

    &__btn {
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
