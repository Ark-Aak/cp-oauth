<template>
    <section class="auth-card login" aria-labelledby="login-title" :aria-busy="operation !== null">
        <noscript
            ><p class="auth-card__error">{{ $t('auth.flow.javascript_required') }}</p></noscript
        >
        <h1 id="login-title" class="auth-card__title">
            {{ twoFactorStep ? $t('auth.flow.two_factor_title') : $t('auth.login.title') }}
        </h1>
        <el-alert
            v-if="verified && !twoFactorStep"
            :title="$t('auth.login.verified')"
            type="success"
            show-icon
            :closable="false"
            class="auth-card__alert"
        />
        <el-alert
            v-if="passwordReset && !twoFactorStep"
            :title="$t('auth.password.reset_success')"
            type="success"
            show-icon
            :closable="false"
            class="auth-card__alert"
        />
        <p v-if="errorMessage" ref="errorEl" class="auth-card__error" role="alert" tabindex="-1">
            {{ errorMessage }}
        </p>
        <p v-if="notice" class="auth-card__status" role="status">{{ notice }}</p>

        <template v-if="twoFactorStep">
            <p
                v-if="operation === 'mfa' && !pendingChallenge"
                class="auth-card__status"
                role="status"
            >
                {{ $t('auth.flow.callback_complete') }}
            </p>
            <template v-else-if="challengeActive">
                <p class="auth-card__desc">
                    {{
                        pendingChallenge?.method === 'email_otp'
                            ? $t('auth.login.twofactor_email_sent')
                            : $t('auth.login.twofactor_totp_required')
                    }}
                </p>
                <el-form
                    class="auth-card__form"
                    method="post"
                    :disabled="!hydrationReady"
                    :model="twoFactorForm"
                    label-position="top"
                    @submit.prevent="verifyTwoFactor"
                >
                    <el-form-item :label="$t('auth.login.twofactor_code')" for="login-otp">
                        <el-input
                            id="login-otp"
                            v-model="twoFactorForm.code"
                            :aria-label="$t('auth.login.twofactor_code')"
                            name="one-time-code"
                            autocomplete="one-time-code"
                            inputmode="numeric"
                            maxlength="6"
                            :disabled="!hydrationReady || operation !== null"
                        />
                    </el-form-item>
                    <p v-if="codeAlreadySubmitted" class="auth-card__status" role="status">
                        {{ $t('auth.flow.code_already_submitted') }}
                    </p>
                    <el-form-item>
                        <el-button
                            type="primary"
                            native-type="submit"
                            :loading="operation === 'mfa'"
                            :disabled="
                                !hydrationReady ||
                                operation !== null ||
                                !validCode ||
                                codeAlreadySubmitted
                            "
                            class="auth-card__button"
                        >
                            {{ $t('auth.login.verify_2fa') }}
                        </el-button>
                    </el-form-item>
                </el-form>
            </template>
            <p v-else class="auth-card__desc" role="status">
                {{ $t('auth.flow.challenge_restart') }}
            </p>
            <el-button
                class="auth-card__button"
                :disabled="operation !== null"
                @click="restartLogin"
            >
                {{ $t('auth.flow.restart_login') }}
            </el-button>
        </template>

        <template v-else>
            <div v-if="configError" class="auth-card__alert">
                <p class="auth-card__error" role="alert">{{ $t('auth.flow.config_error') }}</p>
                <el-button
                    :loading="configPending"
                    :disabled="operation !== null"
                    @click="refreshConfig()"
                >
                    {{ $t('common.retry') }}
                </el-button>
            </div>
            <el-form
                ref="formRef"
                class="auth-card__form"
                method="post"
                :disabled="!hydrationReady"
                :model="form"
                :rules="rules"
                label-position="top"
                @submit.prevent="loginWithPassword"
            >
                <el-form-item prop="email" :label="$t('auth.login.email')" for="login-email">
                    <el-input
                        id="login-email"
                        v-model="form.email"
                        type="email"
                        name="email"
                        :aria-label="$t('auth.login.email')"
                        autocomplete="email"
                        :disabled="!hydrationReady || operation !== null"
                    />
                </el-form-item>
                <el-form-item
                    class="auth-card__field--with-help"
                    prop="password"
                    :label="$t('auth.login.password')"
                    for="login-password"
                >
                    <el-input
                        id="login-password"
                        v-model="form.password"
                        :type="passwordVisible ? 'text' : 'password'"
                        name="password"
                        :aria-label="$t('auth.login.password')"
                        autocomplete="current-password"
                        :disabled="!hydrationReady || operation !== null"
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
                                :disabled="!hydrationReady || operation !== null"
                                @click="passwordVisible = !passwordVisible"
                            >
                                <EyeOff v-if="passwordVisible" :size="18" aria-hidden="true" />
                                <Eye v-else :size="18" aria-hidden="true" />
                            </el-button>
                        </template>
                    </el-input>
                </el-form-item>
                <NuxtLink :to="forgotPath" class="auth-card__link auth-card__recovery">
                    {{ $t('auth.login.forgot_password') }}
                </NuxtLink>
                <div v-if="turnstileEnabled" class="auth-card__captcha">
                    <div ref="turnstileEl" class="auth-card__captcha-widget" />
                    <p class="auth-card__status" role="status">
                        {{ captchaMessage }}
                    </p>
                    <el-button
                        v-if="turnstileStatus === 'error'"
                        :disabled="operation !== null"
                        @click="retryTurnstile()"
                    >
                        {{ $t('common.retry') }}
                    </el-button>
                </div>
                <el-form-item>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="operation === 'password'"
                        :disabled="
                            !hydrationReady || operation !== null || !configReady || !captchaReady
                        "
                        class="auth-card__button"
                    >
                        {{
                            operation === 'password'
                                ? $t('auth.login.loading')
                                : $t('auth.login.submit')
                        }}
                    </el-button>
                </el-form-item>
            </el-form>

            <div class="login__alternatives">
                <div class="auth-card__actions">
                    <el-button
                        :loading="operation === 'passkey'"
                        :disabled="!hydrationReady || operation !== null || !configReady"
                        @click="loginWithPasskey"
                    >
                        <Fingerprint :size="18" :stroke-width="1.5" class="login__icon" />
                        {{ $t('auth.login.with_passkey') }}
                    </el-button>
                </div>
                <p class="login__divider">{{ $t('auth.login.oauth_divider') }}</p>
                <p v-if="providers.length" class="auth-card__desc">
                    {{ $t('auth.flow.oauth_registration_hint') }}
                </p>
                <div class="auth-card__actions login__providers">
                    <el-button
                        v-for="provider in providers"
                        :key="provider.name"
                        :loading="operation === provider.name"
                        :disabled="
                            !hydrationReady || operation !== null || !configReady || !captchaReady
                        "
                        @click="loginWithProvider(provider.name)"
                    >
                        <AppPlatformIcon :platform="provider.name" class="login__icon" />
                        {{ $t(provider.label) }}
                    </el-button>
                    <el-button
                        :loading="operation === 'luogu'"
                        :disabled="!hydrationReady || operation !== null"
                        @click="loginWithLuogu"
                    >
                        <AppPlatformIcon platform="luogu" class="login__icon" />
                        {{ $t('auth.login.with_luogu') }}
                    </el-button>
                </div>
                <p class="auth-card__desc">{{ $t('auth.flow.luogu_existing_only') }}</p>
            </div>
            <p v-if="publicConfig?.registrationEnabled" class="auth-card__footer">
                <span>{{ $t('auth.login.footer') }}</span>
                <NuxtLink :to="registerPath">{{ $t('auth.login.register_link') }}</NuxtLink>
            </p>
        </template>
    </section>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { Eye, EyeOff, Fingerprint } from 'lucide-vue-next';
import type { AuthResult } from '~/types/auth';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { toRequestOptions, serializeAuthenticationCredential } from '~/utils/webauthn';

definePageMeta({ layout: 'auth' });
const hydrationReady = useHydrationReady();

type Provider = 'github' | 'google' | 'codeforces' | 'clist';
const { t } = useI18n();
const route = useRoute();
const api = useApi();
const { accept, pendingChallenge, clearPending, rememberRedirect } = useAuth();
const {
    data: publicConfig,
    pending: configPending,
    error: configError,
    refresh: refreshConfig
} = await usePublicConfig();
const formRef = ref<FormInstance>();
const form = reactive({ email: '', password: '' });
const passwordVisible = ref(false);
const twoFactorForm = reactive({ code: '' });
const operation = ref<'password' | 'passkey' | 'mfa' | 'luogu' | Provider | null>(null);
const errorMessage = ref('');
const errorEl = ref<HTMLElement | null>(null);
const notice = ref('');
const now = ref(Date.now());
const submittedCodes = new Set<string>();
let expiryTimer: ReturnType<typeof setInterval> | undefined;

const siteTitle = computed(() => publicConfig.value?.siteTitle || t('app.name'));
const redirectTarget = computed(() =>
    getSafeRedirectTarget(pendingChallenge.value?.redirect ?? route.query.redirect)
);
const verified = computed(() => route.query.verified === 'true');
const passwordReset = computed(() => route.query.reset === 'true');
const twoFactorStep = computed(() => route.query.step === 'two-factor' || !!pendingChallenge.value);
const challengeActive = computed(
    () => !!pendingChallenge.value && pendingChallenge.value.expiresAt > now.value
);
const validCode = computed(() => /^\d{6}$/.test(twoFactorForm.code.trim()));
const codeAlreadySubmitted = computed(() => submittedCodes.has(twoFactorForm.code.trim()));
const registerPath = computed(() => ({
    path: '/register',
    query: { redirect: redirectTarget.value }
}));
const forgotPath = computed(() => ({
    path: '/forgot-password',
    query: { redirect: redirectTarget.value }
}));
const configReady = computed(
    () => !!publicConfig.value && !configPending.value && !configError.value
);
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
} = useTurnstile(turnstileSiteKey, { action: 'login' });
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
const providers = computed(() =>
    [
        {
            name: 'github' as const,
            enabled: publicConfig.value?.githubLoginEnabled,
            label: 'auth.login.with_github'
        },
        {
            name: 'google' as const,
            enabled: publicConfig.value?.googleLoginEnabled,
            label: 'auth.login.with_google'
        },
        {
            name: 'codeforces' as const,
            enabled: publicConfig.value?.codeforcesLoginEnabled,
            label: 'auth.login.with_codeforces'
        },
        {
            name: 'clist' as const,
            enabled: publicConfig.value?.clistLoginEnabled,
            label: 'auth.login.with_clist'
        }
    ].filter(provider => provider.enabled)
);
const rules = computed<FormRules>(() => ({
    email: [
        { required: true, message: t('auth.flow.email_invalid'), trigger: 'blur' },
        { type: 'email', message: t('auth.flow.email_invalid'), trigger: 'blur' }
    ],
    password: [{ required: true, message: t('auth.login.password'), trigger: 'blur' }]
}));

useHead({
    title: () =>
        `${t(twoFactorStep.value ? 'auth.flow.two_factor_title' : 'auth.login.title')} - ${siteTitle.value}`
});

watch(errorMessage, async message => {
    if (!message) return;
    await nextTick();
    errorEl.value?.focus();
});
watch(
    () => pendingChallenge.value?.challengeId,
    () => {
        twoFactorForm.code = '';
        submittedCodes.clear();
    }
);
onMounted(() => {
    expiryTimer = setInterval(() => {
        now.value = Date.now();
    }, 1000);
});
onBeforeUnmount(() => {
    if (expiryTimer) clearInterval(expiryTimer);
});

function showError(error: unknown) {
    const err = error as { data?: { message?: string } };
    errorMessage.value = err.data?.message || t('auth.login.error');
}

async function loginWithPassword() {
    if (operation.value || !configReady.value || !captchaReady.value || !formRef.value) return;
    operation.value = 'password';
    errorMessage.value = '';
    notice.value = '';
    clearPending();
    try {
        const valid = await formRef.value.validate().catch(() => false);
        if (!valid) return;
        const result = await api<AuthResult>('/api/auth/login', {
            method: 'POST',
            body: {
                email: form.email.trim(),
                password: form.password,
                redirect: redirectTarget.value,
                turnstileToken: turnstileToken.value || undefined
            }
        });
        form.password = '';
        await accept(result);
    } catch (error) {
        showError(error);
    } finally {
        resetTurnstile();
        operation.value = null;
    }
}

async function verifyTwoFactor() {
    if (operation.value || !validCode.value || codeAlreadySubmitted.value) return;
    now.value = Date.now();
    const challenge = pendingChallenge.value;
    if (!challenge || !challengeActive.value) {
        clearPending();
        errorMessage.value = t('auth.flow.challenge_restart');
        return;
    }
    operation.value = 'mfa';
    errorMessage.value = '';
    const code = twoFactorForm.code.trim();
    submittedCodes.add(code);
    twoFactorForm.code = '';
    try {
        const result = await api<AuthResult>('/api/auth/2fa/verify-login', {
            method: 'POST',
            body: { challengeId: challenge.challengeId, code }
        });
        clearPending();
        await accept(result);
    } catch (error) {
        const err = error as { data?: { message?: string; data?: { code?: string } } };
        const code = err.data?.data?.code;
        if (code === 'AUTH_CHALLENGE_EXPIRED' || code === 'AUTH_CHALLENGE_EXHAUSTED') {
            clearPending();
            errorMessage.value = t('auth.flow.challenge_restart');
        } else {
            showError(error);
        }
    } finally {
        operation.value = null;
    }
}

async function restartLogin() {
    if (operation.value) return;
    const redirect = redirectTarget.value;
    clearPending();
    twoFactorForm.code = '';
    errorMessage.value = '';
    notice.value = '';
    await navigateTo({ path: '/login', query: { redirect } }, { replace: true });
}

async function loginWithPasskey() {
    if (operation.value || !configReady.value) return;
    errorMessage.value = '';
    notice.value = '';
    clearPending();
    if (!window.PublicKeyCredential || !navigator.credentials) {
        errorMessage.value = t('auth.login.passkey_not_supported');
        return;
    }
    operation.value = 'passkey';
    try {
        const { challengeId, options } = await api<{
            challengeId: string;
            options: PublicKeyCredentialRequestOptionsJSON;
        }>('/api/auth/passkey/login/options', {
            method: 'POST',
            body: { email: form.email.trim() || undefined, redirect: redirectTarget.value }
        });
        const credential = (await navigator.credentials.get({
            publicKey: toRequestOptions(options)
        })) as PublicKeyCredential | null;
        if (!credential) {
            notice.value = t('auth.flow.passkey_cancelled');
            return;
        }
        const result = await api<AuthResult>('/api/auth/passkey/login/verify', {
            method: 'POST',
            body: { challengeId, response: serializeAuthenticationCredential(credential) }
        });
        form.password = '';
        await accept(result);
    } catch (error) {
        if (
            error instanceof DOMException &&
            (error.name === 'NotAllowedError' || error.name === 'AbortError')
        ) {
            notice.value = t('auth.flow.passkey_cancelled');
        } else {
            showError(error);
        }
    } finally {
        operation.value = null;
    }
}

async function loginWithProvider(provider: Provider) {
    if (operation.value || !configReady.value || !captchaReady.value) return;
    operation.value = provider;
    errorMessage.value = '';
    notice.value = '';
    clearPending();
    try {
        const result = await api<{ authorizationUrl: string }>(
            `/api/auth/thirdparty/${provider}/start`,
            {
                method: 'GET',
                query: {
                    mode: 'login',
                    redirect: redirectTarget.value,
                    turnstileToken: turnstileToken.value || undefined
                }
            }
        );
        rememberRedirect(provider, redirectTarget.value);
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (error) {
        showError(error);
    } finally {
        resetTurnstile();
        operation.value = null;
    }
}

async function loginWithLuogu() {
    if (operation.value) return;
    operation.value = 'luogu';
    clearPending();
    try {
        await navigateTo({
            path: '/oauth/thirdparty/luogu',
            query: { redirect: redirectTarget.value }
        });
    } finally {
        operation.value = null;
    }
}
</script>

<style scoped lang="scss">
.login {
    &__alternatives {
        padding-top: var(--space-4);
        border-top: 1px solid var(--border-color);

        > :last-child {
            margin-bottom: 0;
        }
    }

    &__divider {
        margin-bottom: var(--space-3);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
    }

    &__providers {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    &__icon {
        margin-right: var(--space-2);
        flex-shrink: 0;
    }
}

@media (max-width: 479px) {
    .login__providers {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
