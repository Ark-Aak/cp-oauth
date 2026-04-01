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

        <template v-if="!twoFactorPending">
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
                <div class="login-card__forgot-wrap">
                    <NuxtLink to="/forgot-password" class="login-card__forgot-link">
                        {{ $t('auth.login.forgot_password') }}
                    </NuxtLink>
                </div>
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

            <div class="login-card__oauth">
                <el-divider>{{ $t('auth.login.oauth_divider') }}</el-divider>
                <p class="login-card__oauth-hint">
                    {{ $t('auth.login.thirdparty_auto_register_hint') }}
                </p>
                <el-button
                    class="login-card__oauth-btn"
                    :loading="passkeyLoading"
                    :disabled="!form.email"
                    @click="handlePasskeyLogin"
                >
                    <span class="login-card__oauth-btn-content">
                        <Fingerprint :size="16" :stroke-width="1.5" />
                        <span>{{ $t('auth.login.with_passkey') }}</span>
                    </span>
                </el-button>
                <el-button
                    v-if="codeforcesLoginEnabled"
                    class="login-card__oauth-btn"
                    :loading="codeforcesLoading"
                    @click="handleCodeforcesLogin"
                >
                    <span class="login-card__oauth-btn-content">
                        <AppPlatformIcon platform="codeforces" />
                        <span>{{ $t('auth.login.with_codeforces') }}</span>
                    </span>
                </el-button>
                <el-button
                    v-if="githubLoginEnabled"
                    class="login-card__oauth-btn"
                    :loading="githubLoading"
                    @click="handleGitHubLogin"
                >
                    <span class="login-card__oauth-btn-content">
                        <AppPlatformIcon platform="github" />
                        <span>{{ $t('auth.login.with_github') }}</span>
                    </span>
                </el-button>
                <el-button
                    v-if="googleLoginEnabled"
                    class="login-card__oauth-btn"
                    :loading="googleLoading"
                    @click="handleGoogleLogin"
                >
                    <span class="login-card__oauth-btn-content">
                        <AppPlatformIcon platform="google" />
                        <span>{{ $t('auth.login.with_google') }}</span>
                    </span>
                </el-button>
                <el-button
                    v-if="clistLoginEnabled"
                    class="login-card__oauth-btn"
                    :loading="clistLoading"
                    @click="handleClistLogin"
                >
                    <span class="login-card__oauth-btn-content">
                        <AppPlatformIcon platform="clist" />
                        <span>{{ $t('auth.login.with_clist') }}</span>
                    </span>
                </el-button>
                <el-button class="login-card__oauth-btn" @click="handleLuoguGuideLogin">
                    <span class="login-card__oauth-btn-content">
                        <AppPlatformIcon platform="luogu" />
                        <span>{{ $t('auth.login.with_luogu') }}</span>
                    </span>
                </el-button>
            </div>
        </template>

        <template v-else>
            <el-alert type="warning" :closable="false" class="login-card__alert">
                <template #title>
                    {{
                        twoFactorMethod === 'email_otp'
                            ? $t('auth.login.twofactor_email_sent')
                            : $t('auth.login.twofactor_totp_required')
                    }}
                </template>
            </el-alert>
            <el-form :model="twoFactorForm" @submit.prevent="handleVerifyTwoFactor">
                <el-form-item>
                    <el-input
                        v-model="twoFactorForm.code"
                        maxlength="6"
                        :placeholder="$t('auth.login.twofactor_code')"
                        size="large"
                    />
                </el-form-item>
                <el-form-item>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="twoFactorLoading"
                        size="large"
                        class="login-card__btn"
                    >
                        {{ $t('auth.login.verify_2fa') }}
                    </el-button>
                </el-form-item>
                <el-form-item>
                    <el-button text @click="resetTwoFactorStep">{{
                        $t('auth.login.back')
                    }}</el-button>
                </el-form-item>
            </el-form>
        </template>

        <p class="login-card__footer">
            {{ $t('auth.login.footer') }}
            <NuxtLink to="/register">{{ $t('auth.login.register_link') }}</NuxtLink>
        </p>
    </el-card>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { Fingerprint } from 'lucide-vue-next';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();

useHead({ title: () => `${t('auth.login.title')} - CP OAuth` });
const route = useRoute();
const formRef = ref<FormInstance>();
const loading = ref(false);
const passkeyLoading = ref(false);
const twoFactorLoading = ref(false);
const codeforcesLoading = ref(false);
const githubLoading = ref(false);
const googleLoading = ref(false);
const clistLoading = ref(false);
const verified = computed(() => route.query.verified === 'true');
const redirectTarget = computed(() => getSafeRedirectTarget(route.query.redirect));

interface PublicConfigResponse {
    siteTitle?: string;
    turnstileEnabled?: boolean;
    turnstileSiteKey?: string;
    codeforcesLoginEnabled?: boolean;
    githubLoginEnabled?: boolean;
    googleLoginEnabled?: boolean;
    clistLoginEnabled?: boolean;
}

const form = reactive({
    email: '',
    password: ''
});

const twoFactorForm = reactive({
    challengeId: '',
    code: ''
});

const twoFactorPending = ref(false);
const twoFactorMethod = ref<'email_otp' | 'totp' | ''>('');

const rules = computed<FormRules>(() => ({
    email: [{ required: true, message: t('auth.login.email'), trigger: 'blur' }],
    password: [{ required: true, message: t('auth.login.password'), trigger: 'blur' }]
}));

const { data: publicConfig } = await useFetch<PublicConfigResponse>('/api/public/config');
const siteTitle = computed(() => publicConfig.value?.siteTitle || t('app.name'));
const turnstileEnabled = computed(() => publicConfig.value?.turnstileEnabled || false);
const turnstileSiteKey = computed(() => publicConfig.value?.turnstileSiteKey || '');
const codeforcesLoginEnabled = computed(() => publicConfig.value?.codeforcesLoginEnabled || false);
const githubLoginEnabled = computed(() => publicConfig.value?.githubLoginEnabled || false);
const googleLoginEnabled = computed(() => publicConfig.value?.googleLoginEnabled || false);
const clistLoginEnabled = computed(() => publicConfig.value?.clistLoginEnabled || false);
const { token: turnstileToken, el: turnstileEl } = useTurnstile(turnstileSiteKey);

interface LoginResponse {
    token?: string;
    requiresTwoFactor?: boolean;
    method?: 'email_otp' | 'totp';
    challengeId?: string;
}

function toBase64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    const binary = atob(normalized + padding);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function toArrayBuffer(value: string): ArrayBuffer {
    const bytes = fromBase64Url(value);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function completeLoginResponse(data: LoginResponse) {
    if (data.requiresTwoFactor && data.challengeId && data.method) {
        twoFactorPending.value = true;
        twoFactorMethod.value = data.method;
        twoFactorForm.challengeId = data.challengeId;
        twoFactorForm.code = '';
        return;
    }

    if (data.token) {
        useCookie('auth_token', { maxAge: 7 * 24 * 60 * 60 }).value = data.token;
        await navigateTo(redirectTarget.value);
        return;
    }

    throw new Error('Invalid login response');
}

async function handleLogin() {
    if (!formRef.value) return;
    const valid = await formRef.value.validate().catch(() => false);
    if (!valid) return;

    loading.value = true;
    try {
        const data = await $fetch<LoginResponse>('/api/auth/login', {
            method: 'POST',
            body: {
                email: form.email,
                password: form.password,
                turnstileToken: turnstileToken.value || undefined
            }
        });
        await completeLoginResponse(data);
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        loading.value = false;
    }
}

async function handleVerifyTwoFactor() {
    if (!twoFactorForm.challengeId || !twoFactorForm.code) return;
    twoFactorLoading.value = true;
    try {
        const result = await $fetch<{ token: string }>('/api/auth/2fa/verify-login', {
            method: 'POST',
            body: {
                challengeId: twoFactorForm.challengeId,
                code: twoFactorForm.code
            }
        });
        useCookie('auth_token', { maxAge: 7 * 24 * 60 * 60 }).value = result.token;
        await navigateTo(redirectTarget.value);
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        twoFactorLoading.value = false;
    }
}

function resetTwoFactorStep() {
    twoFactorPending.value = false;
    twoFactorMethod.value = '';
    twoFactorForm.challengeId = '';
    twoFactorForm.code = '';
}

async function handlePasskeyLogin() {
    if (!form.email.trim()) {
        ElMessage.warning(t('auth.login.passkey_email_required'));
        return;
    }
    if (!window.PublicKeyCredential) {
        ElMessage.error(t('auth.login.passkey_not_supported'));
        return;
    }

    passkeyLoading.value = true;
    try {
        const { challengeId, options } = await $fetch<{
            challengeId: string;
            options: {
                challenge: string;
                timeout?: number;
                rpId?: string;
                userVerification?: UserVerificationRequirement;
                allowCredentials?: Array<{
                    id: string;
                    type: PublicKeyCredentialType;
                    transports?: AuthenticatorTransport[];
                }>;
            };
        }>('/api/auth/passkey/login/options', {
            method: 'POST',
            body: {
                email: form.email.trim().toLowerCase()
            }
        });

        const publicKey: PublicKeyCredentialRequestOptions = {
            ...options,
            challenge: toArrayBuffer(options.challenge),
            allowCredentials: options.allowCredentials?.map(item => ({
                ...item,
                id: toArrayBuffer(item.id)
            }))
        };

        const credential = (await navigator.credentials.get({
            publicKey
        })) as PublicKeyCredential | null;

        if (!credential) {
            throw new Error('No credential returned');
        }

        const assertion = credential.response as AuthenticatorAssertionResponse;
        const response = {
            id: credential.id,
            rawId: toBase64Url(new Uint8Array(credential.rawId)),
            type: credential.type,
            response: {
                clientDataJSON: toBase64Url(new Uint8Array(assertion.clientDataJSON)),
                authenticatorData: toBase64Url(new Uint8Array(assertion.authenticatorData)),
                signature: toBase64Url(new Uint8Array(assertion.signature)),
                userHandle: assertion.userHandle
                    ? toBase64Url(new Uint8Array(assertion.userHandle))
                    : null
            },
            clientExtensionResults: credential.getClientExtensionResults()
        };

        const result = await $fetch<LoginResponse>('/api/auth/passkey/login/verify', {
            method: 'POST',
            body: {
                challengeId,
                response
            }
        });

        await completeLoginResponse(result);
    } catch (e: unknown) {
        const err = e as { data?: { message?: string }; message?: string };
        ElMessage.error(err.data?.message || err.message || t('auth.login.error'));
    } finally {
        passkeyLoading.value = false;
    }
}

async function handleGitHubLogin() {
    githubLoading.value = true;
    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/github/start',
            {
                query: {
                    redirect: redirectTarget.value,
                    turnstileToken: turnstileToken.value || ''
                }
            }
        );
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        githubLoading.value = false;
    }
}

async function handleGoogleLogin() {
    googleLoading.value = true;
    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/google/start',
            {
                query: {
                    redirect: redirectTarget.value,
                    turnstileToken: turnstileToken.value || ''
                }
            }
        );
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        googleLoading.value = false;
    }
}

async function handleCodeforcesLogin() {
    codeforcesLoading.value = true;
    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/codeforces/start',
            {
                query: {
                    redirect: redirectTarget.value,
                    turnstileToken: turnstileToken.value || ''
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

async function handleClistLogin() {
    clistLoading.value = true;
    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/clist/start',
            {
                query: {
                    redirect: redirectTarget.value,
                    turnstileToken: turnstileToken.value || ''
                }
            }
        );
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        clistLoading.value = false;
    }
}

async function handleLuoguGuideLogin() {
    await navigateTo({
        path: '/oauth/thirdparty/luogu',
        query: {
            redirect: redirectTarget.value
        }
    });
}
</script>

<style scoped lang="scss">
.login-card {
    width: 100%;
    max-width: 400px;
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

    &__alert {
        margin-bottom: 14px;
    }

    &__forgot-wrap {
        display: flex;
        justify-content: flex-end;
        margin-top: -8px;
        margin-bottom: 8px;
    }

    &__forgot-link {
        color: var(--text-secondary);
        font-size: 12px;
        text-decoration: underline;
    }

    &__turnstile {
        display: flex;
        justify-content: center;
        margin: 4px 0 14px;
    }

    &__btn {
        width: 100%;
    }

    &__oauth {
        margin-bottom: 6px;

        :deep(.el-button + .el-button) {
            margin-left: 0;
        }
    }

    &__oauth-hint {
        margin: 2px 0 8px;
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.5;
    }

    &__oauth-btn {
        width: 100%;
        margin-top: 8px;
    }

    &__oauth-btn-content {
        display: inline-flex;
        align-items: center;
        gap: 8px;
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
