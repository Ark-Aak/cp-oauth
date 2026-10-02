<template>
    <el-dialog
        :model-value="open"
        :title="t('reauth.title')"
        width="min(440px, calc(100vw - 32px))"
        :close-on-click-modal="false"
        :show-close="false"
        destroy-on-close
        @update:model-value="
            value => {
                if (!value) cancel();
            }
        "
        @closed="clearSecrets"
    >
        <div class="reauth">
            <p>{{ t('reauth.description') }}</p>
            <p v-if="error" ref="errorElement" role="alert" tabindex="-1" class="reauth__error">
                {{ error }}
            </p>
            <p v-if="notice" role="status">{{ notice }}</p>
            <form v-if="challenge" method="post" @submit.prevent="verifyMfa">
                <p>
                    {{
                        challenge.method === 'totp'
                            ? t('auth.login.twofactor_totp_required')
                            : t('auth.login.twofactor_email_sent')
                    }}
                </p>
                <label for="reauth-otp">{{ t('auth.login.twofactor_code') }}</label>
                <el-input
                    id="reauth-otp"
                    v-model="otp"
                    autocomplete="one-time-code"
                    inputmode="numeric"
                    :disabled="pending"
                />
                <div class="reauth__actions">
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="pending"
                        :disabled="!otp.trim()"
                        >{{ t('reauth.verify') }}</el-button
                    >
                    <el-button :disabled="pending" @click="restart">{{
                        t('reauth.restart')
                    }}</el-button>
                </div>
            </form>
            <form v-else-if="platformChallenge" method="post" @submit.prevent="verifyPlatform">
                <p>{{ t(`reauth.platform_${platformChallenge.platform}`) }}</p>
                <p v-if="platformChallenge.instructions">{{ platformChallenge.instructions }}</p>
                <label for="reauth-platform-code">{{ t('binding.code_label') }}</label>
                <div class="reauth__code">
                    <el-input
                        id="reauth-platform-code"
                        :model-value="platformChallenge.code"
                        readonly
                    />
                    <el-button :disabled="pending" @click="copyCode">{{
                        t('reauth.copy')
                    }}</el-button>
                </div>
                <p>{{ t('binding.code_expires', { minutes: 10 }) }}</p>
                <label
                    v-if="platformChallenge.platform === 'luogu'"
                    for="reauth-platform-credential"
                    >{{ t('auth.login.luogu_paste_id') }}</label
                >
                <el-input
                    v-if="platformChallenge.platform === 'luogu'"
                    id="reauth-platform-credential"
                    v-model="credential"
                    :disabled="pending"
                />
                <div class="reauth__actions">
                    <el-button
                        native-type="submit"
                        type="primary"
                        :loading="pending"
                        :disabled="platformChallenge.platform === 'luogu' && !credential.trim()"
                        >{{ t('reauth.verify') }}</el-button
                    >
                    <el-button :disabled="pending" @click="restart">{{
                        t('reauth.restart')
                    }}</el-button>
                </div>
            </form>
            <template v-else>
                <form method="post" @submit.prevent="verifyPassword">
                    <label for="reauth-password">{{ t('auth.login.password') }}</label>
                    <el-input
                        id="reauth-password"
                        v-model="password"
                        :type="passwordVisible ? 'text' : 'password'"
                        autocomplete="current-password"
                        :disabled="pending"
                    >
                        <template #suffix>
                            <el-button
                                class="reauth__password-toggle"
                                text
                                native-type="button"
                                :aria-label="
                                    t(
                                        passwordVisible
                                            ? 'auth.flow.hide_password'
                                            : 'auth.flow.show_password'
                                    )
                                "
                                :aria-pressed="passwordVisible"
                                :disabled="pending"
                                @click="passwordVisible = !passwordVisible"
                            >
                                <EyeOff v-if="passwordVisible" :size="18" aria-hidden="true" /><Eye
                                    v-else
                                    :size="18"
                                    aria-hidden="true"
                                />
                            </el-button>
                        </template>
                    </el-input>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="pending"
                        :disabled="!password"
                        >{{ t('reauth.with_password') }}</el-button
                    >
                </form>
                <p class="reauth__alternate">{{ t('reauth.alternatives') }}</p>
                <p v-if="capabilitiesPending" role="status">{{ t('reauth.loading') }}</p>
                <el-button v-if="capabilitiesError" :disabled="pending" @click="loadCapabilities">{{
                    t('common.retry')
                }}</el-button>
                <template v-if="!capabilitiesPending && !capabilitiesError">
                    <el-button v-if="hasPasskeys" :disabled="pending" @click="verifyPasskey">{{
                        t('reauth.with_passkey')
                    }}</el-button>
                    <div v-if="verifiableBindings.length" class="reauth__platform">
                        <label for="reauth-platform">{{ t('reauth.linked_platform') }}</label>
                        <el-select
                            id="reauth-platform"
                            v-model="selectedPlatform"
                            :disabled="pending"
                        >
                            <el-option
                                v-for="account in verifiableBindings"
                                :key="account.id"
                                :value="account.platform"
                                :label="`${t(PLATFORMS[account.platform].translationKey)} — ${account.platformUsername || account.platformUid}`"
                            />
                        </el-select>
                        <el-button
                            :disabled="pending || !selectedPlatform"
                            @click="requestPlatform"
                            >{{ t('reauth.with_platform') }}</el-button
                        >
                    </div>
                    <el-button
                        v-for="account in oauthBindings"
                        :key="account.id"
                        :disabled="pending"
                        @click="verifyOAuth(account.platform as OAuthProvider)"
                    >
                        {{
                            t('reauth.with_provider', {
                                provider: t(PLATFORMS[account.platform].translationKey)
                            })
                        }}
                    </el-button>
                    <p v-if="!hasPasskeys && !verifiableBindings.length && !oauthBindings.length">
                        {{ t('reauth.no_alternative') }}
                    </p>
                </template>
            </template>
            <el-button :disabled="pending" @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { getCurrentInstance } from 'vue';
import { Eye, EyeOff } from 'lucide-vue-next';
import type { AuthResult } from '~/types/auth';
import type { LinkedAccount, PasskeySummary } from '~/types/api';
import {
    PLATFORMS,
    OAUTH_PROVIDERS,
    VERIFIABLE_PLATFORMS,
    type VerifiablePlatform,
    type OAuthProvider
} from '~/utils/platforms';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { toRequestOptions, serializeAuthenticationCredential } from '~/utils/webauthn';

const { t } = useI18n();
const appContext = getCurrentInstance()?.appContext;
const route = useRoute();
const api = useApi();
const auth = useAuth();
const { open, purpose, accept, cancel: cancelRequest, challenge } = useReauthentication();
const password = ref('');
const passwordVisible = ref(false);
const otp = ref('');
const credential = ref('');
const pending = ref(false);
const error = ref('');
const notice = ref('');
const errorElement = ref<HTMLElement>();
const capabilitiesPending = ref(false);
const capabilitiesError = ref(false);
const bindings = ref<LinkedAccount[]>([]);
const hasPasskeys = ref(false);
const selectedPlatform = ref<VerifiablePlatform | ''>('');
const platformChallenge = ref<{
    requestId: string;
    code: string;
    platform: VerifiablePlatform;
    platformUid: string;
    instructions?: string;
    expiresAt: number;
} | null>(null);
const verifiableBindings = computed(() =>
    bindings.value.filter(account =>
        VERIFIABLE_PLATFORMS.includes(account.platform as VerifiablePlatform)
    )
);
const oauthBindings = computed(() =>
    bindings.value.filter(account => OAUTH_PROVIDERS.includes(account.platform as OAuthProvider))
);
let operation = 0;
let authenticatorAbort: AbortController | null = null;

function clearSecrets(clearChallenge = true) {
    operation++;
    authenticatorAbort?.abort();
    authenticatorAbort = null;
    password.value = '';
    passwordVisible.value = false;
    otp.value = '';
    credential.value = '';
    if (clearChallenge) challenge.value = null;
    platformChallenge.value = null;
    error.value = '';
    notice.value = '';
    pending.value = false;
}
function cancel() {
    clearSecrets();
    cancelRequest();
}
function restart() {
    clearSecrets();
}
async function showError(cause: unknown) {
    if (cause === 'cancel' || cause === 'close') {
        notice.value = t('reauth.cancelled');
        return;
    }
    const failure = cause as { data?: { message?: string }; message?: string; name?: string };
    if (failure.name === 'NotAllowedError' || failure.name === 'AbortError') {
        notice.value = t('reauth.cancelled');
        return;
    }
    error.value = failure.data?.message || failure.message || t('common.error');
    await nextTick();
    errorElement.value?.focus();
}
function handleResult(result: AuthResult, id: number) {
    if (!open.value || id !== operation) return;
    password.value = '';
    credential.value = '';
    if ('requiresTwoFactor' in result) {
        challenge.value = {
            challengeId: result.challengeId,
            method: result.method,
            expiresAt: Date.now() + 600_000
        };
        platformChallenge.value = null;
    } else if ('reauthToken' in result && result.purpose === purpose.value) {
        clearSecrets();
        accept(result);
    } else {
        throw new Error(t('reauth.invalid_result'));
    }
}
async function run(action: (id: number) => Promise<void>) {
    if (pending.value || !open.value || !purpose.value) return;
    const id = ++operation;
    pending.value = true;
    error.value = '';
    notice.value = '';
    try {
        await action(id);
    } catch (cause) {
        if (id === operation && open.value) await showError(cause);
    } finally {
        if (id === operation) pending.value = false;
    }
}
async function loadCapabilities() {
    if (!open.value) return;
    const currentPurpose = purpose.value;
    capabilitiesPending.value = true;
    capabilitiesError.value = false;
    try {
        const [accounts, passkeys] = await Promise.all([
            api<LinkedAccount[]>('/api/account/bindings'),
            api<PasskeySummary[]>('/api/auth/passkey/credentials')
        ]);
        if (!open.value || purpose.value !== currentPurpose) return;
        bindings.value = accounts;
        hasPasskeys.value = passkeys.length > 0;
        selectedPlatform.value =
            (verifiableBindings.value[0]?.platform as VerifiablePlatform) || '';
    } catch (cause) {
        if (open.value && purpose.value === currentPurpose) {
            capabilitiesError.value = true;
            await showError(cause);
        }
    } finally {
        capabilitiesPending.value = false;
    }
}
async function verifyPassword() {
    if (!password.value) return;
    await run(async id => {
        const result = await api<AuthResult>('/api/auth/reauth', {
            method: 'POST',
            body: {
                purpose: purpose.value,
                method: 'password',
                password: password.value,
                redirect: getSafeRedirectTarget(route.fullPath)
            }
        });
        handleResult(result, id);
    });
}
async function verifyPasskey() {
    if (!window.PublicKeyCredential) {
        error.value = t('auth.login.passkey_not_supported');
        return;
    }
    await run(async id => {
        const { challengeId, options } = await api<{
            challengeId: string;
            options: PublicKeyCredentialRequestOptionsJSON;
        }>('/api/auth/reauth/passkey/options', {
            method: 'POST',
            body: { purpose: purpose.value, redirect: getSafeRedirectTarget(route.fullPath) }
        });
        if (id !== operation || !open.value) return;
        authenticatorAbort = new AbortController();
        const response = (await navigator.credentials.get({
            publicKey: toRequestOptions(options),
            signal: authenticatorAbort.signal
        })) as PublicKeyCredential | null;
        if (!response) throw new DOMException('Cancelled', 'NotAllowedError');
        if (id !== operation || !open.value) return;
        const result = await api<AuthResult>('/api/auth/reauth/passkey/verify', {
            method: 'POST',
            body: { challengeId, response: serializeAuthenticationCredential(response) }
        });
        handleResult(result, id);
    });
}
async function requestPlatform() {
    if (!selectedPlatform.value) return;
    await run(async id => {
        const result = await api<{
            requestId: string;
            code: string;
            platform: VerifiablePlatform;
            platformUid: string;
            instructions?: string;
        }>('/api/auth/reauth/platform/request', {
            method: 'POST',
            body: {
                purpose: purpose.value,
                platform: selectedPlatform.value,
                redirect: getSafeRedirectTarget(route.fullPath)
            }
        });
        if (id === operation && open.value)
            platformChallenge.value = { ...result, expiresAt: Date.now() + 600_000 };
    });
}
async function verifyPlatform() {
    const state = platformChallenge.value;
    if (!state) return;
    if (state.expiresAt <= Date.now()) {
        restart();
        error.value = t('reauth.expired');
        return;
    }
    await run(async id => {
        const result = await api<AuthResult>('/api/auth/reauth/platform/verify', {
            method: 'POST',
            body: {
                requestId: state.requestId,
                credential:
                    state.platform === 'luogu'
                        ? credential.value.trim()
                        : state.platform === 'leetcode'
                          ? state.platformUid
                          : ''
            }
        });
        handleResult(result, id);
    });
}
async function verifyMfa() {
    const state = challenge.value;
    if (!state || !otp.value.trim()) return;
    if (state.expiresAt <= Date.now()) {
        restart();
        error.value = t('reauth.expired');
        return;
    }
    await run(async id => {
        try {
            const result = await api<AuthResult>('/api/auth/2fa/verify-login', {
                method: 'POST',
                body: { challengeId: state.challengeId, code: otp.value.trim() }
            });
            handleResult(result, id);
        } catch (cause) {
            const failure = cause as { data?: { data?: { code?: string } } };
            if (
                failure.data?.data?.code === 'AUTH_CHALLENGE_EXPIRED' ||
                failure.data?.data?.code === 'AUTH_CHALLENGE_EXHAUSTED'
            ) {
                challenge.value = null;
                otp.value = '';
            }
            throw cause;
        }
    });
}
async function verifyOAuth(provider: OAuthProvider) {
    await run(async id => {
        await ElMessageBox.confirm(
            t('reauth.leave_warning'),
            t('reauth.title'),
            {
                type: 'warning',
                customClass: 'reauth-confirm',
                showClose: false,
                confirmButtonText: t('common.confirm'),
                cancelButtonText: t('common.cancel')
            },
            appContext
        );
        if (id !== operation || !open.value) return;
        const result = await api<{ authorizationUrl: string }>(
            `/api/auth/thirdparty/${provider}/start`,
            {
                query: {
                    mode: 'reauth',
                    purpose: purpose.value,
                    redirect: getSafeRedirectTarget(route.fullPath)
                }
            }
        );
        if (id !== operation || !open.value) return;
        cancelRequest();
        auth.rememberRedirect(provider, getSafeRedirectTarget(route.fullPath));
        await navigateTo(result.authorizationUrl, { external: true });
    });
}
async function copyCode() {
    try {
        await navigator.clipboard.writeText(platformChallenge.value?.code || '');
        notice.value = t('binding.code_copied');
    } catch (cause) {
        await showError(cause);
    }
}
watch([open, purpose], ([value]) => {
    clearSecrets(!value);
    if (value && !challenge.value) void loadCapabilities();
});
onBeforeUnmount(cancel);
</script>

<style scoped lang="scss">
.reauth {
    display: grid;
    gap: 16px;
    color: var(--text-primary);
    p {
        margin: 0;
        color: var(--text-secondary);
    }
    form,
    &__platform {
        display: grid;
        gap: 12px;
    }
    label {
        font-weight: 600;
    }
    &__error {
        color: var(--el-color-danger);
    }
    &__password-toggle {
        min-width: 44px;
        padding: 0;
    }
    &__actions,
    &__code {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }
    &__code .el-input {
        flex: 1;
        min-width: 0;
    }
    &__alternate {
        padding-top: 12px;
        border-top: 1px solid var(--card-border);
    }
    :deep(.el-button),
    :deep(.el-input__wrapper),
    :deep(.el-select__wrapper) {
        min-height: 44px;
    }
    :deep(.el-button + .el-button) {
        margin-left: 0;
    }
}
:global(.reauth-confirm .el-button) {
    min-height: 44px;
}
</style>
