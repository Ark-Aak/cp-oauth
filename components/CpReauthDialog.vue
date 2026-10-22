<template>
    <el-dialog
        :model-value="dialog.open"
        :title="t('common.reauth.title')"
        width="min(480px, calc(100vw - 32px))"
        append-to-body
        destroy-on-close
        @update:model-value="value => !value && cancel()"
        @open="load"
    >
        <p class="reauth__lead">{{ purposeText }}</p>

        <CpDataState :pending="loading" :error="loadError" :rows="2" @retry="load">
            <CpMfaForm
                v-if="mfa"
                :challenge-id="mfa.challengeId"
                :method="mfa.method"
                @done="finish"
                @cancel="mfa = null"
            />

            <CpProofChallenge
                v-else-if="challenge"
                :platform="challenge.platform"
                :code="challenge.code"
                :platform-uid="challenge.platformUid"
                :expires-in="challenge.expiresIn"
                :busy="busy"
                :error="error"
                @submit="submitChallenge"
                @back="challenge = null"
            />

            <div v-else class="reauth__methods">
                <el-segmented
                    v-if="methods.length > 1"
                    v-model="method"
                    :options="methods"
                    block
                    :aria-label="t('common.reauth.method')"
                />

                <form
                    v-if="method === 'password'"
                    class="reauth__form"
                    method="post"
                    @submit.prevent="submitPassword"
                >
                    <label class="reauth__label" :for="passwordId">{{
                        t('common.reauth.password')
                    }}</label>
                    <el-input
                        :id="passwordId"
                        v-model="password"
                        type="password"
                        name="password"
                        autocomplete="current-password"
                        show-password
                    />
                    <p class="cp-help">{{ t('common.reauth.passwordHint') }}</p>
                    <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
                    <div class="reauth__actions">
                        <el-button @click="cancel">{{ t('common.actions.cancel') }}</el-button>
                        <el-button
                            type="primary"
                            native-type="submit"
                            :loading="busy"
                            :disabled="!password"
                        >
                            {{ t('common.actions.confirm') }}
                        </el-button>
                    </div>
                </form>

                <div v-else-if="method === 'passkey'" class="reauth__form">
                    <p class="cp-help">{{ t('common.reauth.passkeyHint') }}</p>
                    <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
                    <div class="reauth__actions">
                        <el-button @click="cancel">{{ t('common.actions.cancel') }}</el-button>
                        <el-button type="primary" :loading="busy" @click="submitPasskey">
                            {{ t('common.reauth.usePasskey') }}
                        </el-button>
                    </div>
                </div>

                <div v-else-if="method === 'linked'" class="reauth__form">
                    <p class="cp-help">{{ t('common.reauth.linkedHint') }}</p>
                    <ul class="reauth__linked">
                        <li v-for="account in linkedOptions" :key="account.platform">
                            <CpPlatformMark :platform="account.platform" />
                            <span class="cp-mono reauth__uid">
                                {{ account.platformUsername || account.platformUid }}
                            </span>
                            <el-button
                                size="small"
                                :loading="busy && busyPlatform === account.platform"
                                @click="startLinked(account)"
                            >
                                {{ t('common.actions.continue') }}
                            </el-button>
                        </li>
                    </ul>
                    <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
                </div>
            </div>
        </CpDataState>
    </el-dialog>
</template>

<script setup lang="ts">
import type { LinkedAccount } from '~/types/api';
import type { AuthResult, ReauthPurpose } from '~/types/auth';
import {
    OAUTH_PROVIDERS,
    VERIFIABLE_PLATFORMS,
    type OAuthProvider,
    type VerifiablePlatform
} from '~/utils/platforms';
import {
    getPasskeyAssertion,
    isPasskeyCancelled,
    isPasskeySupported,
    type PasskeyRequestOptionsJSON
} from '~/utils/passkey-client';

type Method = 'password' | 'passkey' | 'linked';
type ReauthResult = Extract<AuthResult, { reauthToken: string }>;
type MfaResult = Extract<AuthResult, { requiresTwoFactor: true }>;

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { describe } = useApiError();
const { config } = usePublicConfig();
const { dialog, complete } = useReauth();
const startProvider = useProviderStart();
const passwordId = useId();

const loading = ref(false);
const loadError = ref<string | null>(null);
const busy = ref(false);
const busyPlatform = ref<string | null>(null);
const error = ref('');
const method = ref<Method>('password');
const password = ref('');
const passkeyCount = ref(0);
const bindings = ref<LinkedAccount[]>([]);
const mfa = ref<Pick<MfaResult, 'method' | 'challengeId'> | null>(null);
const challenge = ref<{
    requestId: string;
    code: string;
    expiresIn: number;
    platform: VerifiablePlatform;
    platformUid: string;
} | null>(null);

const purpose = computed(() => dialog.value.purpose as ReauthPurpose);
const purposeText = computed(() =>
    dialog.value.purpose ? t(`common.reauth.purpose.${dialog.value.purpose}`) : ''
);

const providerEnabled: Record<OAuthProvider, () => boolean> = {
    github: () => config.value.githubLoginEnabled,
    google: () => config.value.googleLoginEnabled,
    codeforces: () => config.value.codeforcesLoginEnabled,
    clist: () => config.value.clistLoginEnabled
};

const linkedOptions = computed(() =>
    bindings.value.filter(
        account =>
            (VERIFIABLE_PLATFORMS as string[]).includes(account.platform) ||
            ((OAUTH_PROVIDERS as string[]).includes(account.platform) &&
                providerEnabled[account.platform as OAuthProvider]())
    )
);

const methods = computed(() => {
    const list: Array<{ label: string; value: Method }> = [
        { label: t('common.reauth.methods.password'), value: 'password' }
    ];
    if (passkeyCount.value > 0 && import.meta.client && isPasskeySupported()) {
        list.push({ label: t('common.reauth.methods.passkey'), value: 'passkey' });
    }
    if (linkedOptions.value.length) {
        list.push({ label: t('common.reauth.methods.linked'), value: 'linked' });
    }
    return list;
});

function resetState() {
    error.value = '';
    password.value = '';
    mfa.value = null;
    challenge.value = null;
    busy.value = false;
    busyPlatform.value = null;
}

async function load() {
    resetState();
    loading.value = true;
    loadError.value = null;
    try {
        const [status, linked] = await Promise.all([
            api<{ passkeyCount: number }>('/api/auth/2fa/status'),
            api<LinkedAccount[]>('/api/account/bindings')
        ]);
        passkeyCount.value = status.passkeyCount;
        bindings.value = linked;
        method.value = 'password';
    } catch (cause) {
        loadError.value = describe(cause);
    } finally {
        loading.value = false;
    }
}

function cancel() {
    resetState();
    complete(null);
}

function finish(result: AuthResult) {
    if ('reauthToken' in result) {
        const token = (result as ReauthResult).reauthToken;
        resetState();
        complete(token);
        return;
    }
    if ('requiresTwoFactor' in result) {
        const pendingMfa = result as MfaResult;
        mfa.value = { method: pendingMfa.method, challengeId: pendingMfa.challengeId };
        error.value = '';
    }
}

async function run(task: () => Promise<void>) {
    busy.value = true;
    error.value = '';
    try {
        await task();
    } catch (cause) {
        if (isPasskeyCancelled(cause)) error.value = t('common.reauth.passkeyCancelled');
        else error.value = describe(cause);
    } finally {
        busy.value = false;
        busyPlatform.value = null;
    }
}

const submitPassword = () =>
    run(async () => {
        finish(
            await api<AuthResult>('/api/auth/reauth', {
                method: 'POST',
                body: {
                    purpose: purpose.value,
                    method: 'password',
                    password: password.value,
                    redirect: route.fullPath
                }
            })
        );
    });

const submitPasskey = () =>
    run(async () => {
        const { challengeId, options } = await api<{
            challengeId: string;
            options: PasskeyRequestOptionsJSON;
        }>('/api/auth/reauth/passkey/options', {
            method: 'POST',
            body: { purpose: purpose.value, redirect: route.fullPath }
        });
        const response = await getPasskeyAssertion(options);
        if (!response) throw new DOMException('cancelled', 'NotAllowedError');
        finish(
            await api<AuthResult>('/api/auth/reauth/passkey/verify', {
                method: 'POST',
                body: { challengeId, response }
            })
        );
    });

function startLinked(account: LinkedAccount) {
    busyPlatform.value = account.platform;
    return run(async () => {
        if ((OAUTH_PROVIDERS as string[]).includes(account.platform)) {
            await startProvider(account.platform as OAuthProvider, {
                mode: 'reauth',
                purpose: purpose.value,
                redirect: route.fullPath
            });
            return;
        }
        challenge.value = await api<NonNullable<typeof challenge.value>>(
            '/api/auth/reauth/platform/request',
            {
                method: 'POST',
                body: {
                    purpose: purpose.value,
                    platform: account.platform,
                    redirect: route.fullPath
                }
            }
        );
    });
}

const submitChallenge = (credential: string) =>
    run(async () => {
        if (!challenge.value) return;
        finish(
            await api<AuthResult>('/api/auth/reauth/platform/verify', {
                method: 'POST',
                body: { requestId: challenge.value.requestId, credential }
            })
        );
    });
</script>

<style scoped lang="scss">
.reauth__lead {
    margin-bottom: var(--cp-space-4);
    color: var(--cp-text-2);
}

.reauth__methods,
.reauth__form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-3);
}

.reauth__methods {
    gap: var(--cp-space-4);
}

.reauth__label {
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
}

.reauth__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);
    margin-top: var(--cp-space-2);

    :deep(.el-button + .el-button) {
        margin-left: 0;
    }
}

.reauth__linked {
    border-top: 1px solid var(--cp-line);

    li {
        display: flex;
        align-items: center;
        gap: var(--cp-space-3);
        padding: var(--cp-space-3) 0;
        border-bottom: 1px solid var(--cp-line);
    }
}

.reauth__uid {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: var(--cp-text-sm);
    color: var(--cp-text-3);
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
