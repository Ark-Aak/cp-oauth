<template>
    <el-card class="luogu-login-card" shadow="never">
        <h1 class="luogu-login-card__title">{{ $t('auth.login.luogu_guide_title') }}</h1>
        <p class="luogu-login-card__desc">{{ $t('auth.login.with_luogu_tip') }}</p>

        <el-radio-group v-model="mode" class="luogu-login-card__mode-switch">
            <el-radio-button value="challenge">{{
                $t('auth.login.luogu_mode_challenge')
            }}</el-radio-button>
            <el-radio-button value="credential">{{
                $t('auth.login.luogu_mode_credential')
            }}</el-radio-button>
        </el-radio-group>

        <p v-if="mode === 'challenge'" class="luogu-login-card__mode-tip">
            {{ $t('auth.login.luogu_challenge_tip') }}
        </p>
        <p v-else class="luogu-login-card__mode-tip">
            {{ $t('auth.login.luogu_credential_tip') }}
        </p>

        <div v-if="turnstileEnabled" ref="turnstileEl" class="luogu-login-card__turnstile" />
        <p
            v-if="turnstileEnabled && !thirdPartyCaptchaReady"
            class="luogu-login-card__turnstile-hint"
        >
            {{ $t('auth.login.turnstile_required_for_thirdparty') }}
        </p>

        <el-form v-if="mode === 'credential'" @submit.prevent="handleLuoguCredentialLogin">
            <el-form-item>
                <el-input
                    v-model="pasteId"
                    :placeholder="$t('auth.login.luogu_paste_id')"
                    size="large"
                />
            </el-form-item>
            <el-button
                class="luogu-login-card__btn"
                type="primary"
                native-type="submit"
                :loading="loading"
                :disabled="!pasteId.trim() || !thirdPartyCaptchaReady"
                size="large"
            >
                <span class="luogu-login-card__btn-content">
                    <AppPlatformIcon platform="luogu" />
                    <span>{{ $t('auth.login.luogu_login_by_credential') }}</span>
                </span>
            </el-button>
        </el-form>

        <div v-else>
            <div v-if="challengeStep === 1">
                <el-form-item>
                    <el-input
                        v-model="challengeUid"
                        :placeholder="$t('auth.login.luogu_uid_placeholder')"
                        size="large"
                    />
                </el-form-item>
                <el-button
                    class="luogu-login-card__btn"
                    type="primary"
                    :loading="loading"
                    :disabled="!challengeUid.trim() || !thirdPartyCaptchaReady"
                    size="large"
                    @click="handleChallengeRequest"
                >
                    {{ $t('binding.get_code') }}
                </el-button>
            </div>

            <div v-else>
                <div class="luogu-login-card__code" @click="copyChallengeCode">
                    <code>{{ challengeCode }}</code>
                </div>
                <p class="luogu-login-card__code-hint">
                    {{ $t('binding.code_expires', { minutes: 10 }) }}
                </p>

                <el-form @submit.prevent="handleChallengeVerify">
                    <el-form-item>
                        <el-input
                            v-model="challengeCredential"
                            :placeholder="$t('auth.login.luogu_paste_id')"
                            size="large"
                        />
                    </el-form-item>
                    <el-button
                        class="luogu-login-card__btn"
                        type="primary"
                        native-type="submit"
                        :loading="loading"
                        :disabled="!challengeCredential.trim()"
                        size="large"
                    >
                        {{ $t('auth.login.luogu_login_by_challenge') }}
                    </el-button>
                </el-form>
            </div>
        </div>

        <p class="luogu-login-card__back">
            <NuxtLink :to="`/login?redirect=${encodeURIComponent(redirectTarget)}`">
                {{ $t('nav.login') }}
            </NuxtLink>
        </p>
    </el-card>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
useHead({ title: () => `${t('auth.login.luogu_guide_title')} - CP OAuth` });

const route = useRoute();
const loading = ref(false);
const pasteId = ref('');
const mode = ref<'challenge' | 'credential'>('challenge');
const challengeStep = ref(1);
const challengeUid = ref('');
const challengeCode = ref('');
const challengeRequestId = ref('');
const challengeCredential = ref('');
const redirectTarget = getSafeRedirectTarget(route.query.redirect);

interface PublicConfigResponse {
    turnstileEnabled?: boolean;
    turnstileSiteKey?: string;
}

const { data: publicConfig } = await useFetch<PublicConfigResponse>('/api/public/config');
const turnstileEnabled = computed(() => publicConfig.value?.turnstileEnabled || false);
const turnstileSiteKey = computed(() => publicConfig.value?.turnstileSiteKey || '');
const { token: turnstileToken, el: turnstileEl } = useTurnstile(turnstileSiteKey);
const thirdPartyCaptchaReady = computed(
    () => !turnstileEnabled.value || Boolean(turnstileToken.value)
);

watch(mode, value => {
    if (value === 'challenge') {
        challengeStep.value = 1;
        challengeRequestId.value = '';
        challengeCode.value = '';
        challengeCredential.value = '';
    }
});

async function handleLuoguCredentialLogin() {
    loading.value = true;
    try {
        const result = await $fetch<{ token: string }>('/api/auth/thirdparty/luogu/paste-login', {
            method: 'POST',
            body: {
                pasteId: pasteId.value.trim(),
                turnstileToken: turnstileToken.value || ''
            }
        });
        useCookie('auth_token').value = result.token;
        await navigateTo(redirectTarget);
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        loading.value = false;
    }
}

async function handleChallengeRequest() {
    loading.value = true;
    try {
        const result = await $fetch<{ requestId: string; code: string }>(
            '/api/auth/thirdparty/luogu/challenge/request',
            {
                method: 'POST',
                body: {
                    platformUid: challengeUid.value.trim(),
                    turnstileToken: turnstileToken.value || ''
                }
            }
        );

        challengeRequestId.value = result.requestId;
        challengeCode.value = result.code;
        challengeStep.value = 2;
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        loading.value = false;
    }
}

async function handleChallengeVerify() {
    loading.value = true;
    try {
        const result = await $fetch<{ token: string }>(
            '/api/auth/thirdparty/luogu/challenge/verify',
            {
                method: 'POST',
                body: {
                    requestId: challengeRequestId.value,
                    credential: challengeCredential.value.trim()
                }
            }
        );
        useCookie('auth_token').value = result.token;
        await navigateTo(redirectTarget);
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('auth.login.error'));
    } finally {
        loading.value = false;
    }
}

function copyChallengeCode() {
    if (!challengeCode.value) return;
    navigator.clipboard.writeText(challengeCode.value);
    ElMessage.success(t('binding.code_copied'));
}
</script>

<style scoped lang="scss">
.luogu-login-card {
    width: 100%;
    max-width: 420px;
    border: 1px solid var(--border-color);

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--text-primary);
    }

    &__desc {
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.6;
        margin-bottom: 16px;
    }

    &__mode-switch {
        margin-bottom: 10px;
    }

    &__mode-tip {
        margin: 0 0 12px;
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.5;
    }

    &__btn {
        width: 100%;
    }

    &__btn-content {
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }

    &__code {
        padding: 10px 12px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        margin-bottom: 6px;

        code {
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 14px;
            color: var(--text-primary);
        }
    }

    &__code-hint {
        margin: 0 0 12px;
        font-size: 12px;
        color: var(--text-muted);
    }

    &__turnstile {
        display: flex;
        justify-content: center;
        margin: 4px 0 12px;
    }

    &__turnstile-hint {
        margin: -4px 0 12px;
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.4;
    }

    &__back {
        margin-top: 8px;
        text-align: center;
        font-size: 13px;

        a {
            color: var(--text-primary);
            text-decoration: underline;
        }
    }
}
</style>
