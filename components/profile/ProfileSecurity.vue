<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.account')"
            :title="t('common.nav.security')"
            :description="t('security.description')"
        >
            <template #actions>
                <el-button :loading="signingOut" @click="signOut">{{
                    t('common.actions.signOut')
                }}</el-button>
            </template>
        </CpPageHeader>

        <div class="cp-stack">
            <CpSheet
                :title="t('security.password.title')"
                :description="t('security.password.text')"
            >
                <form
                    class="security-form"
                    method="post"
                    novalidate
                    @submit.prevent="changePassword"
                >
                    <input
                        type="text"
                        name="username"
                        autocomplete="username"
                        :value="me.email"
                        hidden
                    />
                    <div class="security-form__grid">
                        <div class="security-form__field security-form__field--wide">
                            <label :for="ids.current">{{ t('security.password.current') }}</label>
                            <el-input
                                :id="ids.current"
                                v-model="password.current"
                                type="password"
                                name="current-password"
                                autocomplete="current-password"
                                show-password
                                :disabled="!hydrated || password.busy"
                            />
                            <p v-if="password.currentError" class="security-form__error">
                                {{ password.currentError }}
                            </p>
                        </div>
                        <div class="security-form__field">
                            <label :for="ids.next">{{ t('security.password.new') }}</label>
                            <el-input
                                :id="ids.next"
                                v-model="password.next"
                                type="password"
                                name="new-password"
                                autocomplete="new-password"
                                show-password
                                :disabled="!hydrated || password.busy"
                            />
                            <p
                                class="cp-help"
                                :class="{ 'security-form__error': password.next && !passwordValid }"
                            >
                                {{ t('security.password.rule') }}
                            </p>
                        </div>
                        <div class="security-form__field">
                            <label :for="ids.confirm">{{ t('security.password.confirm') }}</label>
                            <el-input
                                :id="ids.confirm"
                                v-model="password.confirm"
                                type="password"
                                name="confirm-password"
                                autocomplete="new-password"
                                show-password
                                :disabled="!hydrated || password.busy"
                            />
                            <p
                                v-if="password.confirm && !passwordsMatch"
                                class="security-form__error"
                            >
                                {{ t('security.password.mismatch') }}
                            </p>
                        </div>
                    </div>
                    <CpNote tone="info">{{ t('security.password.effect') }}</CpNote>
                    <CpNote v-if="password.error" tone="danger">{{ password.error }}</CpNote>
                    <div class="security-form__actions">
                        <el-button
                            type="primary"
                            native-type="submit"
                            :loading="password.busy"
                            :disabled="
                                !hydrated || !password.current || !passwordValid || !passwordsMatch
                            "
                        >
                            {{ t('security.password.submit') }}
                        </el-button>
                    </div>
                </form>
            </CpSheet>

            <CpSheet :title="t('security.mfa.title')" :description="t('security.mfa.text')">
                <CpDataState
                    :pending="statusPending"
                    :error="statusError ? describe(statusError) : null"
                    :rows="2"
                    @retry="refreshStatus"
                >
                    <div v-if="status" class="security-mfa">
                        <dl>
                            <CpField :label="t('security.mfa.state')">
                                <CpStatus
                                    :tone="status.twoFactorEnabled ? 'success' : 'warning'"
                                    :label="
                                        status.twoFactorEnabled
                                            ? t('common.states.on')
                                            : t('common.states.off')
                                    "
                                />
                            </CpField>
                            <CpField
                                v-if="status.twoFactorEnabled && status.twoFactorMethod"
                                :label="t('security.mfa.method')"
                            >
                                {{ t(`security.mfa.methods.${status.twoFactorMethod}`) }}
                            </CpField>
                        </dl>

                        <ul v-if="!status.twoFactorEnabled" class="security-mfa__options">
                            <li>
                                <div class="cp-rows__main">
                                    <span class="cp-rows__title">{{
                                        t('security.mfa.methods.totp')
                                    }}</span>
                                    <span class="cp-rows__meta">{{
                                        t('security.mfa.totpText')
                                    }}</span>
                                </div>
                                <el-button
                                    :loading="mfaBusy === 'totp'"
                                    :disabled="!hydrated || !!mfaBusy"
                                    @click="startSetup('totp')"
                                >
                                    {{ t('security.mfa.setUp') }}
                                </el-button>
                            </li>
                            <li>
                                <div class="cp-rows__main">
                                    <span class="cp-rows__title">{{
                                        t('security.mfa.methods.email_otp')
                                    }}</span>
                                    <span class="cp-rows__meta">
                                        {{
                                            status.hasEmail
                                                ? t('security.mfa.emailText')
                                                : t('security.mfa.emailNeedsVerify')
                                        }}
                                        <NuxtLink v-if="!status.hasEmail" to="/profile?tab=basic">{{
                                            t('common.nav.profile')
                                        }}</NuxtLink>
                                    </span>
                                </div>
                                <el-button
                                    :loading="mfaBusy === 'email_otp'"
                                    :disabled="!hydrated || !!mfaBusy || !status.hasEmail"
                                    @click="startSetup('email_otp')"
                                >
                                    {{ t('security.mfa.setUp') }}
                                </el-button>
                            </li>
                        </ul>
                        <CpNote v-if="mfaError" tone="danger">{{ mfaError }}</CpNote>
                    </div>
                </CpDataState>
                <template v-if="status?.twoFactorEnabled" #footer>
                    <el-button
                        type="danger"
                        plain
                        :loading="mfaBusy === 'disable'"
                        :disabled="!hydrated"
                        @click="disableMfa"
                    >
                        {{ t('security.mfa.disable') }}
                    </el-button>
                </template>
            </CpSheet>

            <CpSheet
                :title="t('security.passkeys.title')"
                :description="t('security.passkeys.text')"
                flush
            >
                <template #actions>
                    <el-button
                        v-if="passkeySupported"
                        type="primary"
                        :disabled="!hydrated"
                        @click="openAddPasskey"
                    >
                        {{ t('security.passkeys.add') }}
                    </el-button>
                </template>
                <CpNote
                    v-if="hydrated && !passkeySupported"
                    tone="info"
                    class="security-passkeys__note"
                >
                    {{ t('security.passkeys.unsupported') }}
                </CpNote>
                <CpDataState
                    :pending="passkeysPending"
                    :error="passkeysError ? describe(passkeysError) : null"
                    :empty="!passkeys?.length"
                    :empty-text="t('security.passkeys.empty')"
                    @retry="refreshPasskeys"
                >
                    <ul class="cp-rows">
                        <li v-for="passkey in passkeys" :key="passkey.id">
                            <KeyRound
                                :size="16"
                                :stroke-width="1.75"
                                class="cp-muted"
                                aria-hidden="true"
                            />
                            <div class="cp-rows__main">
                                <span class="cp-rows__title">{{ passkey.name }}</span>
                                <span class="cp-rows__meta">
                                    {{
                                        t('security.passkeys.added', {
                                            date: dateTime(passkey.createdAt)
                                        })
                                    }}
                                </span>
                            </div>
                            <div class="cp-rows__end">
                                <el-button
                                    type="danger"
                                    plain
                                    size="small"
                                    :loading="removing === passkey.id"
                                    @click="removePasskey(passkey)"
                                >
                                    {{ t('common.actions.remove') }}
                                </el-button>
                            </div>
                        </li>
                    </ul>
                </CpDataState>
            </CpSheet>
        </div>

        <ProfileSecurityMfaDialog
            :open="setup.open"
            :method="setup.method"
            :qr-code-data-url="setup.qr"
            @done="setupDone"
            @cancel="setupCancelled"
        />

        <el-dialog
            v-model="addPasskey.open"
            :title="t('security.passkeys.add')"
            width="min(420px, calc(100vw - 32px))"
            append-to-body
        >
            <form class="security-form" method="post" novalidate @submit.prevent="createPasskey">
                <div class="security-form__field">
                    <label :for="ids.passkeyName">{{ t('security.passkeys.name') }}</label>
                    <el-input
                        :id="ids.passkeyName"
                        v-model="addPasskey.name"
                        maxlength="100"
                        :placeholder="t('security.passkeys.namePlaceholder')"
                        :disabled="addPasskey.busy"
                    />
                    <p class="cp-help">{{ t('security.passkeys.nameHint') }}</p>
                </div>
                <CpNote v-if="addPasskey.error" tone="danger">{{ addPasskey.error }}</CpNote>
                <div class="security-form__actions">
                    <el-button :disabled="addPasskey.busy" @click="addPasskey.open = false">
                        {{ t('common.actions.cancel') }}
                    </el-button>
                    <el-button type="primary" native-type="submit" :loading="addPasskey.busy">
                        {{ t('common.actions.continue') }}
                    </el-button>
                </div>
            </form>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { KeyRound } from 'lucide-vue-next';
import type { MeResponse, PasskeySummary } from '~/types/api';
import type { TwoFactorMethod } from '~/types/auth';
import {
    createPasskeyCredential,
    isPasskeyCancelled,
    isPasskeySupported,
    type PasskeyCreationOptionsJSON
} from '~/utils/passkey-client';

interface MfaStatus {
    twoFactorEnabled: boolean;
    twoFactorMethod: TwoFactorMethod | null;
    hasEmail: boolean;
    passkeyCount: number;
}

const { t } = useI18n();
const api = useApi();
const { describe, read } = useApiError();
const { dateTime } = useFormat();
const hydrated = useHydrated();
const session = useSession();
const reauth = useReauth();

const me = computed(() => session.user.value as MeResponse);
const ids = { current: useId(), next: useId(), confirm: useId(), passkeyName: useId() };
const signingOut = ref(false);

async function signOut() {
    signingOut.value = true;
    try {
        await session.signOut();
    } catch (cause) {
        ElMessage.error(describe(cause));
    } finally {
        signingOut.value = false;
    }
}

/* Password */
const password = reactive({
    current: '',
    next: '',
    confirm: '',
    busy: false,
    error: '',
    currentError: ''
});
const passwordValid = computed(() => {
    const bytes = new TextEncoder().encode(password.next).length;
    return password.next.length >= 8 && bytes <= 72;
});
const passwordsMatch = computed(() => password.next === password.confirm);

async function changePassword() {
    if (!passwordValid.value || !passwordsMatch.value || !password.current) return;
    password.busy = true;
    password.error = '';
    password.currentError = '';
    try {
        const reauthToken = await reauth.request('password_change');
        if (!reauthToken) return;
        await api('/api/auth/password/change', {
            method: 'POST',
            body: { currentPassword: password.current, newPassword: password.next, reauthToken }
        });
        password.current = '';
        password.next = '';
        password.confirm = '';
        await session.refresh();
        ElMessage.success(t('security.password.changed'));
    } catch (error) {
        const info = read(error);
        if (info.status === 401 && !info.code)
            password.currentError = t('security.password.wrongCurrent');
        else password.error = describe(error);
    } finally {
        password.busy = false;
    }
}

/* Two-step verification */
const {
    data: status,
    pending: statusPending,
    error: statusError,
    refresh: refreshStatus
} = await useAsyncData('profile-security-status', () => api<MfaStatus>('/api/auth/2fa/status'));

const mfaBusy = ref<TwoFactorMethod | 'disable' | null>(null);
const mfaError = ref('');
const setup = reactive<{ open: boolean; method: TwoFactorMethod; qr: string | null }>({
    open: false,
    method: 'totp',
    qr: null
});

async function startSetup(method: TwoFactorMethod) {
    mfaBusy.value = method;
    mfaError.value = '';
    try {
        const reauthToken = await reauth.request('mfa_change');
        if (!reauthToken) return;
        if (method === 'totp') {
            const { qrCodeDataUrl } = await api<{ qrCodeDataUrl: string }>(
                '/api/auth/2fa/setup/totp/request',
                {
                    method: 'POST',
                    body: { reauthToken }
                }
            );
            setup.qr = qrCodeDataUrl;
        } else {
            await api('/api/auth/2fa/setup/email/request', {
                method: 'POST',
                body: { reauthToken }
            });
            setup.qr = null;
        }
        setup.method = method;
        setup.open = true;
    } catch (error) {
        mfaError.value = describe(error);
    } finally {
        mfaBusy.value = null;
    }
}

async function setupDone() {
    setup.open = false;
    setup.qr = null;
    await Promise.all([refreshStatus(), session.refresh()]);
    ElMessage.success(t('security.mfa.enabled'));
}

function setupCancelled() {
    setup.open = false;
    setup.qr = null;
}

async function disableMfa() {
    try {
        await ElMessageBox.confirm(t('security.mfa.disableConfirm'), t('security.mfa.disable'), {
            type: 'warning',
            confirmButtonText: t('security.mfa.disable'),
            cancelButtonText: t('common.actions.cancel'),
            confirmButtonClass: 'el-button--danger'
        });
    } catch {
        return;
    }
    mfaBusy.value = 'disable';
    mfaError.value = '';
    try {
        const reauthToken = await reauth.request('mfa_change');
        if (!reauthToken) return;
        await api('/api/auth/2fa/disable', { method: 'POST', body: { reauthToken } });
        await Promise.all([refreshStatus(), session.refresh()]);
        ElMessage.success(t('security.mfa.disabled'));
    } catch (error) {
        mfaError.value = describe(error);
    } finally {
        mfaBusy.value = null;
    }
}

/* Passkeys */
const {
    data: passkeys,
    pending: passkeysPending,
    error: passkeysError,
    refresh: refreshPasskeys
} = await useAsyncData('profile-security-passkeys', () =>
    api<PasskeySummary[]>('/api/auth/passkey/credentials')
);

const passkeySupported = computed(() => hydrated.value && isPasskeySupported());
const addPasskey = reactive({ open: false, name: '', busy: false, error: '' });
const removing = ref<string | null>(null);

function openAddPasskey() {
    addPasskey.name = '';
    addPasskey.error = '';
    addPasskey.open = true;
}

async function createPasskey() {
    addPasskey.busy = true;
    addPasskey.error = '';
    try {
        const reauthToken = await reauth.request('passkey_add');
        if (!reauthToken) return;
        const options = await api<PasskeyCreationOptionsJSON>(
            '/api/auth/passkey/register/options',
            {
                method: 'POST',
                body: { reauthToken }
            }
        );
        const response = await createPasskeyCredential(options);
        if (!response) {
            addPasskey.error = t('common.reauth.passkeyCancelled');
            return;
        }
        const name = addPasskey.name.trim();
        await api('/api/auth/passkey/register/verify', {
            method: 'POST',
            body: name ? { response, name } : { response }
        });
        addPasskey.open = false;
        await Promise.all([refreshPasskeys(), refreshStatus(), session.refresh()]);
        ElMessage.success(t('security.passkeys.addedMessage'));
    } catch (error) {
        if (isPasskeyCancelled(error)) addPasskey.error = t('common.reauth.passkeyCancelled');
        else if (read(error).status === 409) addPasskey.error = t('security.passkeys.duplicate');
        else addPasskey.error = describe(error);
    } finally {
        addPasskey.busy = false;
    }
}

async function removePasskey(passkey: PasskeySummary) {
    try {
        await ElMessageBox.confirm(
            t('security.passkeys.removeConfirm', { name: passkey.name }),
            t('security.passkeys.removeTitle'),
            {
                type: 'warning',
                confirmButtonText: t('common.actions.remove'),
                cancelButtonText: t('common.actions.cancel'),
                confirmButtonClass: 'el-button--danger'
            }
        );
    } catch {
        return;
    }
    removing.value = passkey.id;
    try {
        const reauthToken = await reauth.request('passkey_delete');
        if (!reauthToken) return;
        await api(`/api/auth/passkey/credentials/${encodeURIComponent(passkey.id)}`, {
            method: 'DELETE',
            reauthToken
        });
        await Promise.all([refreshPasskeys(), refreshStatus(), session.refresh()]);
        ElMessage.success(t('security.passkeys.removed'));
    } catch (error) {
        ElMessage.error(describe(error));
    } finally {
        removing.value = null;
    }
}
</script>

<style scoped lang="scss">
.security-form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.security-form__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cp-space-4);
}

.security-form__field {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-1);
    min-width: 0;

    label {
        font-size: var(--cp-text-sm);
        font-weight: var(--cp-weight-medium);
        color: var(--cp-text);
    }
}

.security-form__field--wide {
    grid-column: 1 / -1;
    max-width: calc(50% - var(--cp-space-2));
}

.security-form__error {
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-danger);
}

.security-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}

.security-mfa {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.security-mfa__options {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--cp-line);

    > li {
        display: flex;
        align-items: center;
        gap: var(--cp-space-4);
        padding: var(--cp-space-3) 0;
        border-bottom: 1px solid var(--cp-line);
    }
}

.security-passkeys__note {
    margin: var(--cp-space-4) var(--cp-space-5) 0;
}

@media (max-width: 767px) {
    .security-form__grid {
        grid-template-columns: minmax(0, 1fr);
    }

    .security-form__field--wide {
        max-width: none;
    }

    .security-mfa__options > li {
        flex-wrap: wrap;
    }
}
</style>
