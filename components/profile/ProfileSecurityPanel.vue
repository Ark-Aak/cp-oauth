<template>
    <section class="profile-security" aria-labelledby="profile-security-title">
        <header class="profile-security__header">
            <h2 id="profile-security-title">{{ t('profile.security.title') }}</h2>
            <p>{{ t('profile.security.description') }}</p>
        </header>

        <div v-if="refreshError" class="profile-security__notice" role="alert">
            <p>{{ refreshError }}</p>
            <el-button :loading="refreshPending" :disabled="actionPending" @click="refreshSession">
                {{ t('common.retry') }}
            </el-button>
        </div>

        <section class="profile-security__section" aria-labelledby="profile-password-title">
            <h3 id="profile-password-title">{{ t('profile.security.change_password') }}</h3>
            <form
                method="post"
                class="profile-security__form profile-security__password-form"
                novalidate
                @submit.prevent="submitPassword"
            >
                <div class="profile-security__field">
                    <label for="profile-current-password">{{
                        t('profile.security.current_password')
                    }}</label>
                    <el-input
                        id="profile-current-password"
                        ref="currentPasswordInput"
                        v-model="passwordForm.currentPassword"
                        :aria-label="t('profile.security.current_password')"
                        :type="currentPasswordVisible ? 'text' : 'password'"
                        autocomplete="current-password"
                        :disabled="locked"
                        :aria-invalid="!!passwordFields.currentPassword"
                        :aria-describedby="
                            passwordFields.currentPassword
                                ? 'profile-current-password-hint profile-current-password-error'
                                : 'profile-current-password-hint'
                        "
                    >
                        <template #suffix>
                            <el-button
                                class="profile-security__password-toggle"
                                text
                                native-type="button"
                                :aria-label="
                                    t(
                                        currentPasswordVisible
                                            ? 'auth.flow.hide_password'
                                            : 'auth.flow.show_password'
                                    )
                                "
                                :aria-pressed="currentPasswordVisible"
                                :disabled="locked"
                                @click="currentPasswordVisible = !currentPasswordVisible"
                            >
                                <EyeOff
                                    v-if="currentPasswordVisible"
                                    :size="18"
                                    aria-hidden="true"
                                />
                                <Eye v-else :size="18" aria-hidden="true" />
                            </el-button>
                        </template>
                    </el-input>
                    <p id="profile-current-password-hint" class="profile-security__hint">
                        {{ t('profile.security.current_password_hint') }}
                    </p>
                    <p
                        v-if="passwordFields.currentPassword"
                        id="profile-current-password-error"
                        class="profile-security__error"
                        role="alert"
                    >
                        {{ passwordFields.currentPassword }}
                    </p>
                </div>
                <div class="profile-security__field">
                    <label for="profile-new-password">{{
                        t('profile.security.new_password')
                    }}</label>
                    <el-input
                        id="profile-new-password"
                        ref="newPasswordInput"
                        v-model="passwordForm.newPassword"
                        :aria-label="t('profile.security.new_password')"
                        :type="newPasswordVisible ? 'text' : 'password'"
                        autocomplete="new-password"
                        :disabled="locked"
                        :aria-invalid="!!passwordFields.newPassword"
                        :aria-describedby="
                            passwordFields.newPassword
                                ? 'profile-password-rule profile-new-password-error'
                                : 'profile-password-rule'
                        "
                    >
                        <template #suffix>
                            <el-button
                                class="profile-security__password-toggle"
                                text
                                native-type="button"
                                :aria-label="
                                    t(
                                        newPasswordVisible
                                            ? 'auth.flow.hide_password'
                                            : 'auth.flow.show_password'
                                    )
                                "
                                :aria-pressed="newPasswordVisible"
                                :disabled="locked"
                                @click="newPasswordVisible = !newPasswordVisible"
                            >
                                <EyeOff v-if="newPasswordVisible" :size="18" aria-hidden="true" />
                                <Eye v-else :size="18" aria-hidden="true" />
                            </el-button>
                        </template>
                    </el-input>
                    <p id="profile-password-rule" class="profile-security__hint">
                        {{ t('auth.flow.password_rule') }}
                    </p>
                    <p
                        v-if="passwordFields.newPassword"
                        id="profile-new-password-error"
                        class="profile-security__error"
                        role="alert"
                    >
                        {{ passwordFields.newPassword }}
                    </p>
                </div>
                <p
                    v-if="passwordError"
                    ref="passwordErrorElement"
                    class="profile-security__error"
                    role="alert"
                    tabindex="-1"
                >
                    {{ passwordError }}
                </p>
                <p v-if="passwordNotice" class="profile-security__status" role="status">
                    {{ passwordNotice }}
                </p>
                <div class="profile-security__actions">
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="passwordPending"
                        :disabled="locked"
                    >
                        {{ t('profile.security.update_password') }}
                    </el-button>
                    <el-button
                        :disabled="
                            locked || (!passwordForm.currentPassword && !passwordForm.newPassword)
                        "
                        @click="clearPasswordDraft"
                    >
                        {{ t('common.cancel') }}
                    </el-button>
                </div>
            </form>
        </section>

        <section class="profile-security__section" aria-labelledby="profile-twofactor-title">
            <h3 id="profile-twofactor-title">{{ t('profile.security.twofactor') }}</h3>
            <AppAsyncState
                :pending="twoFactorStatus === 'pending' || twoFactorStatus === 'idle'"
                :error="twoFactorError"
                @retry="loadTwoFactor(true)"
            >
                <template v-if="twoFactor">
                    <p class="profile-security__factor-status" role="status">
                        {{
                            twoFactor.twoFactorEnabled
                                ? t('profile.security.enabled_with', {
                                      method: twoFactorMethodLabel
                                  })
                                : t('profile.security.not_enabled')
                        }}
                    </p>
                    <p
                        v-if="!emailVerified"
                        id="profile-email-factor-hint"
                        class="profile-security__hint"
                    >
                        {{ t('profile.security.email_verified_required') }}
                    </p>
                    <div class="profile-security__actions">
                        <el-button
                            :loading="setupPending && requestedMethod === 'email_otp'"
                            :disabled="locked || !emailVerified"
                            :aria-describedby="
                                setupError
                                    ? 'profile-setup-error'
                                    : !emailVerified
                                      ? 'profile-email-factor-hint'
                                      : undefined
                            "
                            @click="startSetup('email_otp', $event)"
                        >
                            {{
                                t(
                                    twoFactor.twoFactorEnabled
                                        ? 'reauth.replace_email'
                                        : 'profile.security.enable_email_otp'
                                )
                            }}
                        </el-button>
                        <el-button
                            ref="totpButton"
                            :loading="setupPending && requestedMethod === 'totp'"
                            :disabled="locked"
                            :aria-describedby="setupError ? 'profile-setup-error' : undefined"
                            @click="startSetup('totp', $event)"
                        >
                            {{
                                t(
                                    twoFactor.twoFactorEnabled
                                        ? 'reauth.replace_totp'
                                        : 'profile.security.enable_totp'
                                )
                            }}
                        </el-button>
                        <el-button
                            v-if="twoFactor.twoFactorEnabled"
                            type="danger"
                            plain
                            :loading="disablePending"
                            :disabled="locked"
                            :aria-describedby="disableError ? 'profile-disable-error' : undefined"
                            @click="disableFactor($event)"
                        >
                            {{ t('profile.security.disable_2fa') }}
                        </el-button>
                    </div>
                </template>
            </AppAsyncState>
            <p
                v-if="setupError"
                id="profile-setup-error"
                class="profile-security__error"
                role="alert"
            >
                {{ setupError }}
            </p>
            <p v-if="setupNotice" class="profile-security__status" role="status">
                {{ setupNotice }}
            </p>
            <p
                v-if="disableError"
                id="profile-disable-error"
                class="profile-security__error"
                role="alert"
            >
                {{ disableError }}
            </p>
            <p v-if="disableNotice" class="profile-security__status" role="status">
                {{ disableNotice }}
            </p>
            <div
                v-if="setupActive"
                class="profile-security__setup"
                role="group"
                aria-labelledby="profile-setup-title"
            >
                <h3 id="profile-setup-title">
                    {{
                        t(
                            setupMethod === 'totp'
                                ? 'profile.security.setup_totp_title'
                                : 'profile.security.setup_email_title'
                        )
                    }}
                </h3>
                <template v-if="setupMethod === 'totp'">
                    <p id="profile-setup-hint" class="profile-security__hint">
                        {{ t('profile.security.totp_scan_hint') }}
                    </p>
                    <img
                        v-if="qrCodeDataUrl"
                        :src="qrCodeDataUrl"
                        :alt="t('profile.security.totp_qr_alt')"
                        width="192"
                        height="192"
                        class="profile-security__qr"
                    />
                </template>
                <p v-else id="profile-setup-hint" class="profile-security__hint">
                    {{ t('profile.security.setup_email_hint') }}
                </p>
                <form
                    method="post"
                    class="profile-security__form"
                    novalidate
                    @submit.prevent="completeSetup"
                >
                    <div class="profile-security__field">
                        <label for="profile-setup-code">{{ t('auth.login.twofactor_code') }}</label>
                        <el-input
                            id="profile-setup-code"
                            ref="setupCodeInput"
                            v-model="setupCode"
                            :aria-label="t('auth.login.twofactor_code')"
                            autocomplete="one-time-code"
                            inputmode="numeric"
                            :disabled="actionPending"
                            :aria-invalid="!!setupCodeError"
                            :aria-describedby="
                                setupCodeError
                                    ? 'profile-setup-hint profile-setup-code-error'
                                    : 'profile-setup-hint'
                            "
                        />
                        <p
                            v-if="setupCodeError"
                            id="profile-setup-code-error"
                            class="profile-security__error"
                            role="alert"
                        >
                            {{ setupCodeError }}
                        </p>
                    </div>
                    <p
                        v-if="confirmError"
                        ref="confirmErrorElement"
                        class="profile-security__error"
                        role="alert"
                        tabindex="-1"
                    >
                        {{ confirmError }}
                    </p>
                    <div class="profile-security__actions">
                        <el-button
                            type="primary"
                            native-type="submit"
                            :loading="confirmPending"
                            :disabled="actionPending"
                        >
                            {{ t('profile.security.confirm_setup') }}
                        </el-button>
                        <el-button
                            :loading="cancelPending"
                            :disabled="actionPending"
                            @click="closeSetup"
                        >
                            {{ t('profile.security.cancel_setup') }}
                        </el-button>
                    </div>
                </form>
            </div>
            <div
                v-if="setupNeedsCancellation && !setupActive && !setupPending"
                class="profile-security__notice"
            >
                <p>{{ t('profile.security.setup_pending_cleanup') }}</p>
                <el-button
                    ref="cancelSetupButton"
                    :loading="cancelPending"
                    :disabled="actionPending"
                    :aria-describedby="cancelError ? 'profile-cancel-setup-error' : undefined"
                    @click="closeSetup"
                >
                    {{ t('profile.security.cancel_setup') }}
                </el-button>
            </div>
            <p
                v-if="cancelError"
                id="profile-cancel-setup-error"
                class="profile-security__error"
                role="alert"
            >
                {{ cancelError }}
            </p>
        </section>

        <section class="profile-security__section" aria-labelledby="profile-passkeys-title">
            <h3 id="profile-passkeys-title">{{ t('profile.security.passkeys') }}</h3>
            <p class="profile-security__hint">{{ t('profile.security.passkey_hint') }}</p>
            <AppAsyncState
                :pending="passkeysStatus === 'pending' || passkeysStatus === 'idle'"
                :error="passkeysError"
                @retry="loadPasskeys(true)"
            >
                <p
                    v-if="passkeysStatus === 'success' && passkeys?.length === 0"
                    class="profile-security__empty"
                    role="status"
                >
                    <KeyRound :size="18" aria-hidden="true" />
                    {{ t('profile.security.no_passkeys') }}
                </p>
                <template v-else-if="passkeys?.length">
                    <table class="profile-security__table">
                        <caption class="sr-only">
                            {{
                                t('profile.security.passkeys')
                            }}
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">{{ t('profile.security.passkey_name_label') }}</th>
                                <th scope="col">{{ t('profile.security.created_at') }}</th>
                                <th scope="col">{{ t('profile.security.actions') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="key in passkeys" :key="key.id">
                                <th scope="row">{{ key.name }}</th>
                                <td>{{ formatCSTTime(key.createdAt) }}</td>
                                <td>
                                    <el-button
                                        type="danger"
                                        plain
                                        :loading="removingPasskeyId === key.id"
                                        :disabled="locked"
                                        :aria-label="
                                            t('profile.security.remove_passkey_named', {
                                                name: key.name
                                            })
                                        "
                                        :aria-describedby="
                                            removeError ? 'profile-remove-passkey-error' : undefined
                                        "
                                        @click="deletePasskey(key.id, $event)"
                                    >
                                        {{ t('profile.security.remove_passkey') }}
                                    </el-button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <ul class="profile-security__passkey-cards">
                        <li
                            v-for="key in passkeys"
                            :key="key.id"
                            class="profile-security__passkey-card"
                        >
                            <strong>{{ key.name }}</strong>
                            <dl>
                                <dt>{{ t('profile.security.created_at') }}</dt>
                                <dd>{{ formatCSTTime(key.createdAt) }}</dd>
                            </dl>
                            <el-button
                                type="danger"
                                plain
                                :loading="removingPasskeyId === key.id"
                                :disabled="locked"
                                :aria-label="
                                    t('profile.security.remove_passkey_named', { name: key.name })
                                "
                                :aria-describedby="
                                    removeError ? 'profile-remove-passkey-error' : undefined
                                "
                                @click="deletePasskey(key.id, $event)"
                            >
                                {{ t('profile.security.remove_passkey') }}
                            </el-button>
                        </li>
                    </ul>
                </template>
            </AppAsyncState>
            <p
                v-if="removeError"
                id="profile-remove-passkey-error"
                class="profile-security__error"
                role="alert"
            >
                {{ removeError }}
            </p>
            <p v-if="removeNotice" class="profile-security__status" role="status">
                {{ removeNotice }}
            </p>
            <form
                method="post"
                class="profile-security__form profile-security__passkey-form"
                novalidate
                @submit.prevent="addPasskey"
            >
                <div class="profile-security__field">
                    <label for="profile-passkey-name">{{
                        t('profile.security.passkey_name_label')
                    }}</label>
                    <el-input
                        id="profile-passkey-name"
                        ref="passkeyNameInput"
                        v-model="passkeyName"
                        :aria-label="t('profile.security.passkey_name_label')"
                        autocomplete="off"
                        maxlength="100"
                        :disabled="locked"
                        :aria-invalid="!!passkeyNameError"
                        :aria-describedby="
                            passkeyNameError
                                ? 'profile-passkey-name-hint profile-passkey-name-error'
                                : 'profile-passkey-name-hint'
                        "
                    />
                    <p id="profile-passkey-name-hint" class="profile-security__hint">
                        {{ t('profile.security.passkey_name_hint') }}
                    </p>
                    <p
                        v-if="passkeyNameError"
                        id="profile-passkey-name-error"
                        class="profile-security__error"
                        role="alert"
                    >
                        {{ passkeyNameError }}
                    </p>
                </div>
                <p
                    v-if="passkeyError"
                    ref="passkeyErrorElement"
                    class="profile-security__error"
                    role="alert"
                    tabindex="-1"
                >
                    {{ passkeyError }}
                </p>
                <p v-if="passkeyNotice" class="profile-security__status" role="status">
                    {{ passkeyNotice }}
                </p>
                <div class="profile-security__actions">
                    <el-button
                        ref="addPasskeyButton"
                        type="primary"
                        native-type="submit"
                        :loading="passkeyPending"
                        :disabled="locked"
                    >
                        {{ t('profile.security.add_passkey') }}
                    </el-button>
                    <el-button
                        v-if="credentialPending"
                        :disabled="!ready"
                        @click="abortRegistration"
                        >{{ t('common.cancel') }}</el-button
                    >
                </div>
            </form>
        </section>
    </section>
</template>

<script setup lang="ts">
import { Eye, EyeOff, KeyRound } from 'lucide-vue-next';
import type { ButtonInstance, InputInstance } from 'element-plus';
import type { TwoFactorMethod } from '~/types/auth';
import { useProfileTaskGuard } from '~/components/profile/profile-workbench';
import { formatCSTTime } from '~/utils/time';

const { t } = useI18n();
const security = useProfileSecurity();
const {
    twoFactor,
    passkeys,
    twoFactorStatus,
    passkeysStatus,
    twoFactorError,
    passkeysError,
    loadTwoFactor,
    loadPasskeys,
    passwordForm,
    passwordPending,
    passwordError,
    passwordFields,
    passwordNotice,
    setupMethod,
    setupCode,
    qrCodeDataUrl,
    setupActive,
    setupNeedsCancellation,
    setupPending,
    setupError,
    setupNotice,
    confirmPending,
    confirmError,
    setupCodeError,
    cancelPending,
    cancelError,
    disablePending,
    disableError,
    disableNotice,
    passkeyName,
    passkeyPending,
    credentialPending,
    passkeyError,
    passkeyNameError,
    passkeyNotice,
    abortRegistration,
    removingPasskeyId,
    removeError,
    removeNotice,
    refreshPending,
    refreshError,
    refreshSession,
    emailVerified,
    actionPending: securityActionPending,
    locked: securityLocked
} = security;
const ready = ref(false);
const locked = computed(() => !ready.value || securityLocked.value);
const actionPending = computed(() => !ready.value || securityActionPending.value);
const currentPasswordVisible = ref(false);
const newPasswordVisible = ref(false);
const requestedMethod = ref<TwoFactorMethod | null>(null);
const currentPasswordInput = ref<InputInstance>();
const newPasswordInput = ref<InputInstance>();
const setupCodeInput = ref<InputInstance>();
const passkeyNameInput = ref<InputInstance>();
const totpButton = ref<ButtonInstance>();
const addPasskeyButton = ref<ButtonInstance>();
const cancelSetupButton = ref<ButtonInstance>();
const passwordErrorElement = ref<HTMLElement>();
const confirmErrorElement = ref<HTMLElement>();
const passkeyErrorElement = ref<HTMLElement>();
const twoFactorMethodLabel = computed(() =>
    twoFactor.value?.twoFactorMethod
        ? t(`profile.security.method_${twoFactor.value.twoFactorMethod}`)
        : '—'
);
let setupReturnFocus: HTMLElement | null = null;
let mounted = true;

function trigger(event?: Event): HTMLElement | null {
    const target = event?.currentTarget;
    if (target instanceof HTMLButtonElement) return target;
    return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

async function restoreFocus(previous: HTMLElement | null, fallback = totpButton.value) {
    await nextTick();
    if (!mounted) return;
    if (
        previous?.isConnected &&
        !previous.hasAttribute('disabled') &&
        previous.getClientRects().length
    ) {
        previous.focus();
        return;
    }
    const candidates = [cancelSetupButton.value, fallback, addPasskeyButton.value];
    for (const candidate of candidates) {
        const element = candidate?.$el as HTMLElement | undefined;
        if (
            element?.isConnected &&
            !element.hasAttribute('disabled') &&
            element.getClientRects().length
        ) {
            element.focus();
            return;
        }
    }
}

function clearPasswordDraft() {
    security.clearPassword();
    currentPasswordVisible.value = false;
    newPasswordVisible.value = false;
}

async function submitPassword() {
    const previous = trigger();
    await security.changePassword();
    await nextTick();
    if (!mounted) return;
    if (!passwordForm.currentPassword) currentPasswordVisible.value = false;
    if (!passwordForm.newPassword) newPasswordVisible.value = false;
    if (passwordFields.value.currentPassword) currentPasswordInput.value?.focus();
    else if (passwordFields.value.newPassword) newPasswordInput.value?.focus();
    else if (passwordError.value) passwordErrorElement.value?.focus();
    else await restoreFocus(previous);
}

async function startSetup(method: TwoFactorMethod, event: Event) {
    const previous = trigger(event);
    requestedMethod.value = method;
    const started = await security.beginSetup(method);
    if (!mounted) return;
    if (started) {
        setupReturnFocus = previous;
        await nextTick();
        setupCodeInput.value?.focus();
    } else await restoreFocus(previous);
}

async function completeSetup() {
    const completed = await security.confirmSetup();
    await nextTick();
    if (!mounted) return;
    if (completed) await restoreFocus(setupReturnFocus);
    else if (setupCodeError.value) setupCodeInput.value?.focus();
    else confirmErrorElement.value?.focus();
}

async function closeSetup() {
    try {
        await security.cancelSetup();
        setupNotice.value = t('profile.security.setup_cancelled');
    } catch {
        // cancelError retains the failure; a cleared QR never implies server cancellation succeeded.
    } finally {
        await restoreFocus(setupReturnFocus);
    }
}

async function disableFactor(event: Event) {
    const previous = trigger(event);
    await security.disableTwoFactor();
    await restoreFocus(previous);
}

async function addPasskey() {
    const previous = trigger();
    await security.registerPasskey();
    await nextTick();
    if (!mounted) return;
    if (passkeyNameError.value) passkeyNameInput.value?.focus();
    else if (passkeyError.value) passkeyErrorElement.value?.focus();
    else await restoreFocus(previous, addPasskeyButton.value);
}

async function deletePasskey(id: string, event: Event) {
    const previous = trigger(event);
    const removed = await security.removePasskey(id);
    await restoreFocus(removed ? null : previous, addPasskeyButton.value);
}

useProfileTaskGuard({
    dirty: () => security.dirty.value,
    pending: () => security.pending.value,
    beforeLeave: async () => {
        try {
            await security.cancelSetup();
            passkeyName.value = '';
        } catch (cause) {
            await restoreFocus(null, cancelSetupButton.value);
            throw cause;
        } finally {
            security.clearSecrets();
            currentPasswordVisible.value = false;
            newPasswordVisible.value = false;
        }
    }
});
onMounted(() => {
    ready.value = true;
    void security.load();
});
onBeforeUnmount(() => {
    mounted = false;
    currentPasswordVisible.value = false;
    newPasswordVisible.value = false;
    security.dispose();
});
</script>

<style scoped lang="scss">
.profile-security {
    min-width: 0;

    &__header {
        margin-bottom: var(--space-4);

        p {
            color: var(--text-secondary);
            margin-top: var(--space-2);
        }
    }

    &__section {
        min-width: 0;
        padding-block: var(--space-5);
        border-top: 1px solid var(--border-color);

        > h3 {
            margin-bottom: var(--space-4);
        }
        > p {
            margin-block: var(--space-3);
        }
    }

    &__section:last-child {
        padding-bottom: 0;
    }

    &__header + &__section {
        border-top: 0;
        padding-top: 0;
    }

    &__form {
        display: grid;
        gap: var(--space-4);
        max-width: 680px;
    }

    &__field {
        display: grid;
        gap: var(--space-2);
        min-width: 0;

        label {
            color: var(--text-primary);
            font-weight: 600;
            font-size: var(--font-size-control);
        }
    }

    &__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-top: var(--space-3);
    }

    &__hint {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
    }
    &__factor-status {
        margin-bottom: var(--space-3);
        font-weight: 600;
    }
    &__status {
        padding: var(--space-2) var(--space-3);
        border-left: 2px solid var(--accent);
        background: var(--accent-subtle);
        overflow-wrap: anywhere;
    }
    &__empty {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin: var(--space-3) 0;
        color: var(--text-secondary);
    }
    &__empty svg {
        flex-shrink: 0;
    }
    &__error {
        color: var(--el-color-danger);
        overflow-wrap: anywhere;
    }
    &__password-toggle {
        min-width: 44px;
        padding: 0;
    }

    &__notice {
        padding: var(--space-3) var(--space-4);
        margin-block: var(--space-4);
        border-left: 2px solid var(--border-color);

        p {
            margin-bottom: var(--space-3);
        }
    }

    &__setup {
        max-width: 680px;
        margin-top: var(--space-4);
        padding: var(--space-4);
        border-left: 2px solid var(--accent);
        background: var(--bg-secondary);

        h3 {
            margin-bottom: var(--space-3);
        }
    }

    &__qr {
        display: block;
        max-width: 100%;
        height: auto;
        margin-block: var(--space-4);
    }
    &__passkey-form {
        margin-top: var(--space-4);
    }

    &__table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-variant-numeric: tabular-nums;

        th,
        td {
            padding: var(--space-3);
            border-bottom: 1px solid var(--border-color);
            overflow-wrap: anywhere;
        }
        thead th {
            color: var(--text-secondary);
            font-weight: 600;
        }
        tbody th {
            font-weight: 600;
        }
        th:last-child,
        td:last-child {
            text-align: right;
        }
    }

    &__passkey-cards {
        display: none;
        list-style: none;
        padding: 0;
    }

    &__passkey-card {
        display: grid;
        gap: var(--space-3);
        padding-block: var(--space-4);
        border-bottom: 1px solid var(--border-color);
        overflow-wrap: anywhere;

        dl {
            display: grid;
            gap: var(--space-1);
        }
        dt {
            color: var(--text-secondary);
            font-size: var(--font-size-meta);
        }
        dd {
            margin: 0;
            font-variant-numeric: tabular-nums;
        }
        .el-button {
            justify-self: start;
        }
    }

    :deep(.el-button),
    :deep(.el-input__wrapper) {
        min-height: 44px;
    }
    :deep(.el-button + .el-button) {
        margin-left: 0;
    }

    @media (min-width: 768px) {
        &__password-form {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            max-width: none;
            align-items: start;
        }
        &__password-form > .profile-security__actions,
        &__password-form > .profile-security__error,
        &__password-form > .profile-security__status {
            grid-column: 1 / -1;
        }
    }
}

@media (max-width: 767px) {
    .profile-security {
        &__table {
            display: none;
        }
        &__passkey-cards {
            display: block;
        }
        &__actions > .el-button {
            max-width: 100%;
            white-space: normal;
        }
    }
}
</style>
