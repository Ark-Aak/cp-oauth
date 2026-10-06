<template>
    <section class="auth-card" aria-labelledby="forgot-password-title" :aria-busy="pending">
        <h1 id="forgot-password-title" class="auth-card__title">
            {{ $t('auth.password.forgot_title') }}
        </h1>
        <p class="auth-card__desc">{{ $t('auth.password.forgot_desc') }}</p>
        <p v-if="errorMessage" ref="errorEl" class="auth-card__error" role="alert" tabindex="-1">
            {{ errorMessage }}
        </p>
        <el-alert
            v-if="sent"
            :title="$t('auth.password.reset_sent')"
            type="success"
            show-icon
            :closable="false"
            class="auth-card__alert"
        />
        <el-form
            ref="formRef"
            class="auth-card__form"
            method="post"
            :disabled="!hydrationReady"
            :model="form"
            :rules="rules"
            label-position="top"
            @submit.prevent="sendReset"
        >
            <el-form-item prop="email" :label="$t('auth.login.email')" for="forgot-email">
                <el-input
                    id="forgot-email"
                    v-model="form.email"
                    :aria-label="$t('auth.login.email')"
                    type="email"
                    name="email"
                    autocomplete="email"
                    :disabled="!hydrationReady || pending"
                />
            </el-form-item>
            <el-form-item>
                <el-button
                    type="primary"
                    native-type="submit"
                    :loading="pending"
                    :disabled="!hydrationReady || pending"
                    class="auth-card__button"
                >
                    {{ $t('auth.password.send_reset') }}
                </el-button>
            </el-form-item>
        </el-form>
        <NuxtLink :to="loginPath" class="auth-card__link">
            {{ $t('auth.password.back_login') }}
        </NuxtLink>
    </section>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { buildLoginPath, getSafeRedirectTarget } from '~/utils/auth-redirect';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const route = useRoute();
const api = useApi();
const { data: publicConfig } = await usePublicConfig();
const formRef = ref<FormInstance>();
const form = reactive({ email: '' });
const pending = ref(false);
const sent = ref(false);
const errorMessage = ref('');
const errorEl = ref<HTMLElement | null>(null);
const hydrationReady = useHydrationReady();
const siteTitle = computed(() => publicConfig.value?.siteTitle || t('app.name'));
const redirectTarget = computed(() => getSafeRedirectTarget(route.query.redirect));
const loginPath = computed(() => buildLoginPath(redirectTarget.value));
const rules = computed<FormRules>(() => ({
    email: [
        { required: true, message: t('auth.flow.email_invalid'), trigger: 'blur' },
        { type: 'email', message: t('auth.flow.email_invalid'), trigger: 'blur' }
    ]
}));

useHead({ title: () => `${t('auth.password.forgot_title')} - ${siteTitle.value}` });
watch(errorMessage, async message => {
    if (!message) return;
    await nextTick();
    errorEl.value?.focus();
});

async function sendReset() {
    if (pending.value || !formRef.value) return;
    pending.value = true;
    errorMessage.value = '';
    sent.value = false;
    try {
        const valid = await formRef.value.validate().catch(() => false);
        if (!valid) return;
        await api<{ success: true }>('/api/auth/password/forgot', {
            method: 'POST',
            body: { email: form.email.trim(), redirect: redirectTarget.value }
        });
        sent.value = true;
    } catch (error) {
        const err = error as { data?: { message?: string } };
        errorMessage.value = err.data?.message || t('auth.password.reset_error');
    } finally {
        pending.value = false;
    }
}
</script>
