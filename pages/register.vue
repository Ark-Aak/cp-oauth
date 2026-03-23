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

        <div class="login-card__oauth">
            <el-divider>{{ $t('auth.login.oauth_divider') }}</el-divider>
            <p v-if="turnstileEnabled && !thirdPartyCaptchaReady" class="login-card__oauth-hint">
                {{ $t('auth.register.turnstile_required_for_thirdparty') }}
            </p>
            <el-button
                v-if="codeforcesLoginEnabled"
                class="login-card__oauth-btn"
                :loading="codeforcesLoading"
                :disabled="!thirdPartyCaptchaReady"
                @click="handleCodeforcesRegister"
            >
                <span class="login-card__oauth-btn-content">
                    <AppPlatformIcon platform="codeforces" />
                    <span>{{ $t('auth.register.with_codeforces') }}</span>
                </span>
            </el-button>
            <el-button
                v-if="githubLoginEnabled"
                class="login-card__oauth-btn"
                :loading="githubLoading"
                :disabled="!thirdPartyCaptchaReady"
                @click="handleGitHubRegister"
            >
                <span class="login-card__oauth-btn-content">
                    <AppPlatformIcon platform="github" />
                    <span>{{ $t('auth.register.with_github') }}</span>
                </span>
            </el-button>
            <el-button
                class="login-card__oauth-btn"
                :loading="luoguDialogLoading"
                :disabled="!thirdPartyCaptchaReady"
                @click="openLuoguDialog"
            >
                <span class="login-card__oauth-btn-content">
                    <AppPlatformIcon platform="luogu" />
                    <span>{{ $t('auth.register.with_luogu') }}</span>
                </span>
            </el-button>
        </div>

        <el-dialog
            v-model="luoguDialogVisible"
            :title="$t('auth.register.with_luogu')"
            width="480px"
            :close-on-click-modal="false"
        >
            <div v-if="luoguRegisterStep === 1">
                <p class="login-card__luogu-tip">{{ $t('auth.register.luogu_step1') }}</p>
                <el-input v-model="luoguUid" :placeholder="$t('binding.uid_placeholder')" />
                <div class="login-card__luogu-actions">
                    <el-button
                        type="primary"
                        :loading="luoguDialogLoading"
                        :disabled="!luoguUid.trim() || !thirdPartyCaptchaReady"
                        @click="handleLuoguRegisterRequest"
                    >
                        {{ $t('binding.get_code') }}
                    </el-button>
                </div>
            </div>

            <div v-else>
                <p class="login-card__luogu-tip">{{ $t('auth.register.luogu_step2') }}</p>
                <div class="login-card__luogu-code" @click="copyLuoguCode">
                    <code>{{ luoguCode }}</code>
                </div>
                <el-input
                    v-model="luoguCredential"
                    :placeholder="$t('binding.paste_id_placeholder')"
                    class="login-card__luogu-input"
                />
                <div class="login-card__luogu-actions">
                    <el-button
                        type="primary"
                        :loading="luoguDialogLoading"
                        :disabled="!luoguCredential.trim()"
                        @click="handleLuoguRegisterVerify"
                    >
                        {{ $t('binding.verify') }}
                    </el-button>
                </div>
            </div>
        </el-dialog>

        <p class="login-card__footer">
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
    codeforcesLoginEnabled?: boolean;
    githubLoginEnabled?: boolean;
}

useHead({ title: () => `${t('auth.register.title')} - CP OAuth` });
const formRef = ref<FormInstance>();
const loading = ref(false);
const codeforcesLoading = ref(false);
const githubLoading = ref(false);
const luoguDialogVisible = ref(false);
const luoguDialogLoading = ref(false);
const luoguRegisterStep = ref(1);
const luoguUid = ref('');
const luoguCode = ref('');
const luoguRequestId = ref('');
const luoguCredential = ref('');

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
const codeforcesLoginEnabled = computed(() => publicConfig.value?.codeforcesLoginEnabled || false);
const githubLoginEnabled = computed(() => publicConfig.value?.githubLoginEnabled || false);
const { token: turnstileToken, el: turnstileEl } = useTurnstile(turnstileSiteKey);
const thirdPartyCaptchaReady = computed(
    () => !turnstileEnabled.value || Boolean(turnstileToken.value)
);

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
        useCookie('auth_token').value = data.token;
        navigateTo('/');
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.register.error'));
    } finally {
        loading.value = false;
    }
}

async function handleGitHubRegister() {
    githubLoading.value = true;
    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/github/start',
            {
                query: {
                    mode: 'register',
                    redirect: '/',
                    turnstileToken: turnstileToken.value || ''
                }
            }
        );
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.register.error'));
    } finally {
        githubLoading.value = false;
    }
}

async function handleCodeforcesRegister() {
    codeforcesLoading.value = true;
    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/codeforces/start',
            {
                query: {
                    mode: 'register',
                    redirect: '/',
                    turnstileToken: turnstileToken.value || ''
                }
            }
        );
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.register.error'));
    } finally {
        codeforcesLoading.value = false;
    }
}

function openLuoguDialog() {
    luoguRegisterStep.value = 1;
    luoguUid.value = '';
    luoguCode.value = '';
    luoguRequestId.value = '';
    luoguCredential.value = '';
    luoguDialogVisible.value = true;
}

async function handleLuoguRegisterRequest() {
    luoguDialogLoading.value = true;
    try {
        const result = await $fetch<{ requestId: string; code: string }>(
            '/api/auth/thirdparty/luogu/register/request',
            {
                method: 'POST',
                body: {
                    platformUid: luoguUid.value.trim(),
                    turnstileToken: turnstileToken.value || ''
                }
            }
        );
        luoguRequestId.value = result.requestId;
        luoguCode.value = result.code;
        luoguRegisterStep.value = 2;
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.register.error'));
    } finally {
        luoguDialogLoading.value = false;
    }
}

async function handleLuoguRegisterVerify() {
    luoguDialogLoading.value = true;
    try {
        const result = await $fetch<{ token: string }>(
            '/api/auth/thirdparty/luogu/register/verify',
            {
                method: 'POST',
                body: {
                    requestId: luoguRequestId.value,
                    credential: luoguCredential.value.trim()
                }
            }
        );
        useCookie('auth_token').value = result.token;
        luoguDialogVisible.value = false;
        await navigateTo('/');
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.register.error'));
    } finally {
        luoguDialogLoading.value = false;
    }
}

function copyLuoguCode() {
    navigator.clipboard.writeText(luoguCode.value);
    ElMessage.success(t('binding.code_copied'));
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
        display: flex;
        justify-content: center;
        margin: 4px 0 16px;
    }

    &__btn {
        width: 100%;
    }

    &__oauth {
        margin-bottom: 8px;

        :deep(.el-button + .el-button) {
            margin-left: 0;
        }
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

    &__oauth-hint {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.4;
    }

    &__luogu-tip {
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1.5;
        margin-bottom: 8px;
    }

    &__luogu-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 10px;
    }

    &__luogu-input {
        margin-top: 10px;
    }

    &__luogu-code {
        padding: 10px 12px;
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        border-radius: 6px;
        cursor: pointer;

        code {
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 14px;
            font-weight: 600;
        }
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
