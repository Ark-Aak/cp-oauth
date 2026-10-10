<template>
    <section class="auth-card" aria-labelledby="reset-password-title" :aria-busy="pending">
        <h1 id="reset-password-title" class="auth-card__title">
            {{ $t('auth.password.reset_title') }}
        </h1>
        <p v-if="!success && token && !tokenInvalid" class="auth-card__lead">
            {{ $t('auth.password.reset_lead') }}
        </p>
        <p v-if="visibleError" ref="errorEl" class="auth-card__error" role="alert" tabindex="-1">
            {{ visibleError }}
        </p>
        <template v-if="success">
            <p class="auth-card__status" role="status">{{ $t('auth.password.reset_success') }}</p>
            <NuxtLink :to="loginPath" class="el-button el-button--primary auth-card__button">
                {{ $t('auth.password.back_login') }}
            </NuxtLink>
        </template>
        <template v-else-if="!token || tokenInvalid">
            <NuxtLink :to="forgotPath" class="el-button el-button--primary auth-card__button">
                {{ $t('auth.flow.reset_request_again') }}
            </NuxtLink>
        </template>
        <el-form
            v-else
            ref="formRef"
            class="auth-card__form"
            method="post"
            :disabled="!hydrationReady"
            :model="form"
            :rules="rules"
            label-position="top"
            @submit.prevent="resetPassword"
        >
            <el-form-item
                class="auth-card__field--with-help"
                prop="newPassword"
                :label="$t('auth.password.new_password')"
                for="reset-password"
            >
                <el-input
                    id="reset-password"
                    v-model="form.newPassword"
                    :aria-label="$t('auth.password.new_password')"
                    aria-describedby="reset-password-hint"
                    :type="passwordVisible ? 'text' : 'password'"
                    name="new-password"
                    autocomplete="new-password"
                    :disabled="!hydrationReady || pending"
                >
                    <template #suffix>
                        <el-button
                            class="auth-card__password-toggle"
                            text
                            native-type="button"
                            :aria-label="
                                $t(
                                    passwordVisible
                                        ? 'auth.flow.hide_password'
                                        : 'auth.flow.show_password'
                                )
                            "
                            :aria-pressed="passwordVisible"
                            :disabled="!hydrationReady || pending"
                            @click="passwordVisible = !passwordVisible"
                        >
                            <EyeOff v-if="passwordVisible" :size="18" aria-hidden="true" />
                            <Eye v-else :size="18" aria-hidden="true" />
                        </el-button>
                    </template>
                </el-input>
            </el-form-item>
            <p id="reset-password-hint" class="auth-card__field-hint">
                {{ $t('auth.flow.password_rule') }}
            </p>
            <el-form-item>
                <el-button
                    type="primary"
                    native-type="submit"
                    :loading="pending"
                    :disabled="!hydrationReady || pending"
                    class="auth-card__button"
                >
                    {{ $t('auth.password.reset_now') }}
                </el-button>
            </el-form-item>
        </el-form>
        <p v-if="!success" class="auth-card__footer">
            <NuxtLink :to="loginPath">{{ $t('auth.password.back_login') }}</NuxtLink>
        </p>
    </section>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { Eye, EyeOff } from 'lucide-vue-next';
import { buildLoginPath, getSafeRedirectTarget } from '~/utils/auth-redirect';
import { newPasswordSchema } from '~/utils/validation';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const route = useRoute();
const api = useApi();
const { load, clearPending } = useAuth();
const passwordVisible = ref(false);
const { data: publicConfig } = await usePublicConfig();
const formRef = ref<FormInstance>();
const form = reactive({ newPassword: '' });
const pending = ref(false);
const hydrationReady = useHydrationReady();
const success = ref(false);
const tokenInvalid = ref(false);
const errorMessage = ref('');
const errorEl = ref<HTMLElement | null>(null);
const resultRedirect = ref<string | null>(null);
const token = computed(() => {
    const value = Array.isArray(route.query.token) ? route.query.token[0] : route.query.token;
    return typeof value === 'string' ? value : '';
});
const siteTitle = computed(() => publicConfig.value?.siteTitle || t('app.name'));
const redirectTarget = computed(
    () => resultRedirect.value ?? getSafeRedirectTarget(route.query.redirect)
);
const loginPath = computed(() => buildLoginPath(redirectTarget.value));
const forgotPath = computed(() => ({
    path: '/forgot-password',
    query: { redirect: redirectTarget.value }
}));
const visibleError = computed(() => {
    if (!token.value) return t('auth.flow.reset_missing');
    if (tokenInvalid.value) return t('auth.flow.reset_expired');
    return errorMessage.value;
});
const rules = computed<FormRules>(() => ({
    newPassword: [
        { required: true, message: t('auth.flow.password_rule'), trigger: 'blur' },
        {
            validator: (_rule, value: string, callback) => {
                callback(
                    newPasswordSchema.safeParse(value).success
                        ? undefined
                        : new Error(t('auth.flow.password_rule'))
                );
            },
            trigger: 'blur'
        }
    ]
}));

useHead({ title: () => `${t('auth.password.reset_title')} - ${siteTitle.value}` });
watch(visibleError, async message => {
    if (!message) return;
    await nextTick();
    errorEl.value?.focus();
});
watch(token, () => {
    tokenInvalid.value = false;
    success.value = false;
    errorMessage.value = '';
    resultRedirect.value = null;
    form.newPassword = '';
});
onMounted(() => {
    if (visibleError.value) errorEl.value?.focus();
});

async function resetPassword() {
    if (pending.value || success.value || !token.value || tokenInvalid.value || !formRef.value)
        return;
    pending.value = true;
    errorMessage.value = '';
    try {
        const valid = await formRef.value.validate().catch(() => false);
        if (!valid) return;
        const result = await api<{ success: true; redirect: string }>('/api/auth/password/reset', {
            method: 'POST',
            body: {
                token: token.value,
                newPassword: form.newPassword,
                redirect: redirectTarget.value
            }
        });
        resultRedirect.value = getSafeRedirectTarget(result.redirect, redirectTarget.value);
        success.value = true;
        form.newPassword = '';
        clearPending();
        try {
            await load(true);
        } catch {
            errorMessage.value = t('identity.identity_unavailable');
        }
    } catch (error) {
        const err = error as { data?: { message?: string; data?: { code?: string } } };
        if (err.data?.data?.code === 'RESET_TOKEN_INVALID_OR_EXPIRED') {
            tokenInvalid.value = true;
        } else {
            errorMessage.value = err.data?.message || t('auth.password.reset_error');
        }
    } finally {
        pending.value = false;
    }
}
</script>
