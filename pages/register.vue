<template>
    <section class="auth-card" aria-labelledby="register-title" :aria-busy="pending">
        <h1 id="register-title" class="auth-card__title">{{ $t('auth.register.title') }}</h1>
        <p class="auth-card__lead">{{ $t('auth.register.lead') }}</p>
        <p v-if="errorMessage" ref="errorEl" class="auth-card__error" role="alert" tabindex="-1">
            {{ errorMessage }}
        </p>
        <template v-if="configError">
            <p class="auth-card__error" role="alert">{{ $t('auth.flow.config_error') }}</p>
            <el-button :loading="configPending" :disabled="pending" @click="refreshConfig()">
                {{ $t('common.retry') }}
            </el-button>
        </template>
        <p v-else-if="configPending || !publicConfig" class="auth-card__status" role="status">
            {{ $t('auth.flow.config_loading') }}
        </p>
        <p v-else-if="!registrationEnabled" class="auth-card__desc" role="status">
            {{ $t('auth.flow.registration_closed') }}
        </p>
        <el-form
            v-else
            ref="formRef"
            class="auth-card__form"
            method="post"
            :disabled="!hydrationReady"
            :model="form"
            :rules="rules"
            label-position="top"
            @submit.prevent="register"
        >
            <el-form-item
                class="auth-card__field--with-help"
                prop="username"
                :label="$t('auth.register.username')"
                for="register-username"
            >
                <el-input
                    id="register-username"
                    v-model="form.username"
                    :aria-label="$t('auth.register.username')"
                    aria-describedby="register-username-hint"
                    name="username"
                    autocomplete="username"
                    :disabled="!hydrationReady || pending"
                />
            </el-form-item>
            <p id="register-username-hint" class="auth-card__field-hint">
                {{ $t('auth.register.username_hint') }}
            </p>
            <el-form-item prop="email" :label="$t('auth.register.email')" for="register-email">
                <el-input
                    id="register-email"
                    v-model="form.email"
                    :aria-label="$t('auth.register.email')"
                    type="email"
                    name="email"
                    autocomplete="email"
                    :disabled="!hydrationReady || pending"
                />
            </el-form-item>
            <el-form-item
                class="auth-card__field--with-help"
                prop="password"
                :label="$t('auth.register.password')"
                for="register-password"
            >
                <el-input
                    id="register-password"
                    v-model="form.password"
                    :aria-label="$t('auth.register.password')"
                    aria-describedby="register-password-hint"
                    :type="passwordVisible ? 'text' : 'password'"
                    name="password"
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
            <p id="register-password-hint" class="auth-card__field-hint">
                {{ $t('auth.flow.password_rule') }}
            </p>
            <div v-if="turnstileEnabled" class="auth-card__captcha">
                <div ref="turnstileEl" class="auth-card__captcha-widget" />
                <p class="auth-card__status" role="status">{{ captchaMessage }}</p>
                <el-button
                    v-if="turnstileStatus === 'error'"
                    :disabled="pending"
                    @click="retryTurnstile()"
                >
                    {{ $t('common.retry') }}
                </el-button>
            </div>
            <el-form-item>
                <el-button
                    type="primary"
                    native-type="submit"
                    :loading="pending"
                    :disabled="!hydrationReady || pending || !captchaReady"
                    class="auth-card__button"
                >
                    {{ pending ? $t('auth.register.loading') : $t('auth.register.submit') }}
                </el-button>
            </el-form-item>
        </el-form>
        <p class="auth-card__footer">
            <span>{{ $t('auth.register.footer') }}</span>
            <NuxtLink :to="loginPath">{{ $t('auth.register.login_link') }}</NuxtLink>
        </p>
    </section>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import type { AuthResult } from '~/types/auth';
import { buildLoginPath, getSafeRedirectTarget } from '~/utils/auth-redirect';
import { isValidUsername, normalizeUsername } from '~/utils/username';
import { Eye, EyeOff } from 'lucide-vue-next';
import { newPasswordSchema } from '~/utils/validation';

definePageMeta({ layout: 'auth' });
const hydrationReady = useHydrationReady();

const { t } = useI18n();
const route = useRoute();
const api = useApi();
const { accept, clearPending } = useAuth();
const passwordVisible = ref(false);
const {
    data: publicConfig,
    pending: configPending,
    error: configError,
    refresh: refreshConfig
} = await usePublicConfig();
const formRef = ref<FormInstance>();
const form = reactive({ username: '', email: '', password: '' });
const pending = ref(false);
const errorMessage = ref('');
const errorEl = ref<HTMLElement | null>(null);
const siteTitle = computed(() => publicConfig.value?.siteTitle || t('app.name'));
const redirectTarget = computed(() => getSafeRedirectTarget(route.query.redirect));
const loginPath = computed(() => buildLoginPath(redirectTarget.value));
const registrationEnabled = computed(() => publicConfig.value?.registrationEnabled === true);
const turnstileEnabled = computed(() => publicConfig.value?.turnstileEnabled === true);
const turnstileSiteKey = computed(() =>
    turnstileEnabled.value ? publicConfig.value?.turnstileSiteKey || '' : ''
);
const {
    token: turnstileToken,
    el: turnstileEl,
    reset: resetTurnstile,
    status: turnstileStatus,
    error: turnstileError,
    retry: retryTurnstile
} = useTurnstile(turnstileSiteKey, { action: 'register' });
const captchaReady = computed(
    () => !turnstileEnabled.value || (turnstileStatus.value === 'ready' && !!turnstileToken.value)
);
const captchaMessage = computed(() => {
    if (turnstileStatus.value === 'error')
        return turnstileError.value || t('auth.flow.captcha_error');
    if (captchaReady.value) return t('auth.flow.captcha_ready');
    return t(
        turnstileStatus.value === 'loading'
            ? 'auth.flow.captcha_loading'
            : 'auth.flow.captcha_waiting'
    );
});
const rules = computed<FormRules>(() => ({
    username: [
        { required: true, message: t('profile.username_invalid'), trigger: 'blur' },
        {
            validator: (_rule, value: string, callback) => {
                callback(
                    isValidUsername(normalizeUsername(value))
                        ? undefined
                        : new Error(t('profile.username_invalid'))
                );
            },
            trigger: 'blur'
        }
    ],
    email: [
        { required: true, message: t('auth.flow.email_invalid'), trigger: 'blur' },
        { type: 'email', message: t('auth.flow.email_invalid'), trigger: 'blur' }
    ],
    password: [
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

useHead({ title: () => `${t('auth.register.title')} - ${siteTitle.value}` });
watch(errorMessage, async message => {
    if (!message) return;
    await nextTick();
    errorEl.value?.focus();
});

async function register() {
    if (
        pending.value ||
        !registrationEnabled.value ||
        configPending.value ||
        configError.value ||
        !captchaReady.value ||
        !formRef.value
    )
        return;
    pending.value = true;
    errorMessage.value = '';
    clearPending();
    try {
        const valid = await formRef.value.validate().catch(() => false);
        if (!valid) return;
        const result = await api<AuthResult>('/api/auth/register', {
            method: 'POST',
            body: {
                username: normalizeUsername(form.username),
                email: form.email.trim(),
                password: form.password,
                redirect: redirectTarget.value,
                turnstileToken: turnstileToken.value || undefined
            }
        });
        form.password = '';
        await accept(result);
    } catch (error) {
        const err = error as { data?: { message?: string } };
        errorMessage.value = err.data?.message || t('auth.register.error');
    } finally {
        resetTurnstile();
        pending.value = false;
    }
}
</script>
