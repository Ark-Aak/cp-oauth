<template>
    <section
        class="auth-card luogu-auth"
        aria-labelledby="luogu-auth-title"
        :aria-busy="operation !== null"
    >
        <h1 id="luogu-auth-title" class="auth-card__title">
            {{ $t('auth.login.luogu_guide_title') }}
        </h1>
        <p class="auth-card__desc">{{ $t('auth.flow.luogu_existing_only') }}</p>
        <p class="auth-card__desc">{{ $t('auth.flow.luogu_setup_hint') }}</p>
        <p v-if="errorMessage" ref="errorEl" class="auth-card__error" role="alert" tabindex="-1">
            {{ errorMessage }}
        </p>
        <p v-if="notice" class="auth-card__status" role="status">{{ notice }}</p>

        <p v-if="completed" class="auth-card__status" role="status">
            {{ $t('auth.flow.callback_complete') }}
        </p>
        <template v-else-if="restartRequired || challengeExpired">
            <p class="auth-card__desc" role="status">
                {{ $t('auth.flow.luogu_challenge_restart') }}
            </p>
            <el-button
                class="auth-card__button"
                :disabled="operation !== null"
                @click="restartChallenge"
            >
                {{ $t('auth.flow.restart_login') }}
            </el-button>
        </template>
        <template v-else-if="challenge">
            <p class="auth-card__desc">
                {{ $t('binding.step2_desc', { platform: 'Luogu' }) }}
            </p>
            <p class="luogu-auth__code-label">{{ $t('binding.code_label') }}</p>
            <pre class="luogu-auth__code"><code>{{ challenge.code }}</code></pre>
            <div class="auth-card__actions">
                <el-button
                    :loading="copyPending"
                    :disabled="operation !== null || copyPending"
                    @click="copyChallengeCode"
                >
                    {{ $t('auth.flow.copy_code') }}
                </el-button>
            </div>
            <p class="auth-card__desc">{{ $t('binding.code_expires', { minutes: 10 }) }}</p>
            <el-form
                ref="verifyFormRef"
                class="auth-card__form"
                method="post"
                :disabled="!hydrationReady"
                :model="form"
                :rules="verifyRules"
                label-position="top"
                @submit.prevent="verifyChallenge"
            >
                <el-form-item
                    prop="pasteId"
                    :label="$t('auth.login.luogu_paste_id')"
                    for="luogu-paste"
                >
                    <el-input
                        id="luogu-paste"
                        v-model="form.pasteId"
                        name="luogu-paste"
                        :aria-label="$t('auth.login.luogu_paste_id')"
                        :disabled="!hydrationReady || operation !== null"
                    />
                </el-form-item>
                <el-form-item>
                    <el-button
                        class="auth-card__button"
                        type="primary"
                        native-type="submit"
                        :loading="operation === 'verify'"
                        :disabled="!hydrationReady || operation !== null"
                    >
                        {{ $t('auth.login.luogu_login_by_challenge') }}
                    </el-button>
                </el-form-item>
            </el-form>
            <el-button :disabled="operation !== null" @click="restartChallenge">
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
            <p class="auth-card__desc">{{ $t('auth.login.luogu_challenge_tip') }}</p>
            <el-form
                ref="requestFormRef"
                class="auth-card__form"
                method="post"
                :disabled="!hydrationReady"
                :model="form"
                :rules="requestRules"
                label-position="top"
                @submit.prevent="requestChallenge"
            >
                <el-form-item prop="uid" :label="$t('auth.flow.luogu_uid')" for="luogu-uid">
                    <el-input
                        id="luogu-uid"
                        v-model="form.uid"
                        name="username"
                        autocomplete="username"
                        inputmode="numeric"
                        :aria-label="$t('auth.flow.luogu_uid')"
                        :disabled="!hydrationReady || operation !== null"
                    />
                </el-form-item>
                <div v-if="turnstileEnabled" class="auth-card__captcha">
                    <div ref="turnstileEl" class="auth-card__captcha-widget" />
                    <p class="auth-card__status" role="status">{{ captchaMessage }}</p>
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
                        class="auth-card__button"
                        type="primary"
                        native-type="submit"
                        :loading="operation === 'request'"
                        :disabled="
                            !hydrationReady || operation !== null || !configReady || !captchaReady
                        "
                    >
                        {{ $t('binding.get_code') }}
                    </el-button>
                </el-form-item>
            </el-form>
        </template>
        <p class="auth-card__footer">
            <NuxtLink :to="loginPath">{{ $t('auth.login.with_account_password') }}</NuxtLink>
        </p>
    </section>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import type { AuthResult } from '~/types/auth';
import { buildLoginPath, getSafeRedirectTarget } from '~/utils/auth-redirect';

definePageMeta({ layout: 'auth' });
const hydrationReady = useHydrationReady();

const { t } = useI18n();
const route = useRoute();
const api = useApi();
const { accept, clearPending } = useAuth();
const {
    data: publicConfig,
    pending: configPending,
    error: configError,
    refresh: refreshConfig
} = await usePublicConfig();
const form = reactive({ uid: '', pasteId: '' });
const requestFormRef = ref<FormInstance>();
const verifyFormRef = ref<FormInstance>();
const challenge = ref<{ requestId: string; code: string; expiresAt: number } | null>(null);
const operation = ref<'request' | 'verify' | null>(null);
const copyPending = ref(false);
const restartRequired = ref(false);
const completed = ref(false);
const errorMessage = ref('');
const errorEl = ref<HTMLElement | null>(null);
const notice = ref('');
const now = ref(Date.now());
let expiryTimer: ReturnType<typeof setInterval> | undefined;
const redirectTarget = computed(() => getSafeRedirectTarget(route.query.redirect));
const loginPath = computed(() => buildLoginPath(redirectTarget.value));
const challengeExpired = computed(
    () => !!challenge.value && challenge.value.expiresAt <= now.value
);
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
} = useTurnstile(turnstileSiteKey, { action: 'luogu_challenge' });
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
const requestRules = computed<FormRules>(() => ({
    uid: [
        {
            required: true,
            pattern: /^[1-9]\d*$/,
            message: t('auth.flow.luogu_uid_invalid'),
            trigger: 'blur'
        }
    ]
}));
const verifyRules = computed<FormRules>(() => ({
    pasteId: [
        {
            required: true,
            whitespace: true,
            message: t('auth.login.luogu_paste_id'),
            trigger: 'blur'
        }
    ]
}));

useHead({
    title: () =>
        `${t('auth.login.luogu_guide_title')} - ${publicConfig.value?.siteTitle || t('app.name')}`
});
watch(errorMessage, async message => {
    if (!message) return;
    await nextTick();
    errorEl.value?.focus();
});
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

async function requestChallenge() {
    if (operation.value || !configReady.value || !captchaReady.value || !requestFormRef.value)
        return;
    operation.value = 'request';
    errorMessage.value = '';
    notice.value = '';
    clearPending();
    try {
        const valid = await requestFormRef.value.validate().catch(() => false);
        if (!valid) return;
        const result = await api<{ requestId: string; code: string; expiresIn: number }>(
            '/api/auth/thirdparty/luogu/challenge/request',
            {
                method: 'POST',
                body: {
                    luoguUid: form.uid.trim(),
                    redirect: redirectTarget.value,
                    turnstileToken: turnstileToken.value || undefined
                }
            }
        );
        challenge.value = {
            requestId: result.requestId,
            code: result.code,
            expiresAt: Date.now() + result.expiresIn * 1000
        };
        form.pasteId = '';
    } catch (error) {
        showError(error);
    } finally {
        resetTurnstile();
        operation.value = null;
    }
}

async function verifyChallenge() {
    if (operation.value || !verifyFormRef.value || !challenge.value) return;
    now.value = Date.now();
    if (challengeExpired.value) {
        restartRequired.value = true;
        return;
    }
    operation.value = 'verify';
    errorMessage.value = '';
    notice.value = '';
    const requestId = challenge.value.requestId;
    try {
        const valid = await verifyFormRef.value.validate().catch(() => false);
        if (!valid) return;
        const result = await api<AuthResult>('/api/auth/thirdparty/luogu/challenge/verify', {
            method: 'POST',
            body: { requestId, pasteId: form.pasteId.trim() }
        });
        challenge.value = null;
        form.pasteId = '';
        completed.value = true;
        await accept(result);
    } catch (error) {
        const err = error as { data?: { data?: { code?: string } } };
        const code = err.data?.data?.code;
        if (code === 'AUTH_CHALLENGE_EXPIRED' || code === 'AUTH_CHALLENGE_EXHAUSTED') {
            challenge.value = null;
            form.pasteId = '';
            restartRequired.value = true;
        }
        if (completed.value) {
            completed.value = false;
            restartRequired.value = true;
        }
        showError(error);
    } finally {
        operation.value = null;
    }
}

function restartChallenge() {
    if (operation.value) return;
    challenge.value = null;
    form.pasteId = '';
    restartRequired.value = false;
    completed.value = false;
    errorMessage.value = '';
    notice.value = '';
    clearPending();
    resetTurnstile();
}

async function copyChallengeCode() {
    if (!challenge.value || challengeExpired.value || operation.value || copyPending.value) return;
    copyPending.value = true;
    errorMessage.value = '';
    notice.value = '';
    try {
        await navigator.clipboard.writeText(challenge.value.code);
        notice.value = t('binding.code_copied');
    } catch {
        errorMessage.value = t('auth.flow.copy_error');
    } finally {
        copyPending.value = false;
    }
}
</script>

<style scoped lang="scss">
.luogu-auth {
    &__code-label {
        margin-bottom: var(--space-2);
        color: var(--text-primary);
        font-size: var(--font-size-control);
    }

    &__code {
        margin: 0 0 var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--border-color);
        border-radius: var(--card-radius);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: var(--font-size-control);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }
}
</style>
