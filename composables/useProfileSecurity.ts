import { computed, getCurrentInstance, onBeforeUnmount, reactive, ref, shallowRef } from 'vue';
import { ElMessageBox } from 'element-plus';
import type { PasskeySummary, TwoFactorStatus } from '~/types/api';
import type { AuthResult, ReauthPurpose, TwoFactorMethod } from '~/types/auth';
import {
    profileError,
    profileFieldErrors,
    type ProfileRequestStatus
} from '~/components/profile/profile-workbench';
import { newPasswordSchema } from '~/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { serializeRegistrationCredential, toCreationOptions } from '~/utils/webauthn';

interface PasswordInput {
    newPassword: string;
    currentPassword?: string;
}

function cancelled(cause: unknown) {
    if (cause === 'cancel' || cause === 'close') return true;
    const name = (cause as { name?: string } | null)?.name;
    return name === 'AbortError' || name === 'NotAllowedError';
}

function failureCode(cause: unknown) {
    const failure = cause as { data?: { code?: string; data?: { code?: string } } } | null;
    return failure?.data?.data?.code ?? failure?.data?.code;
}

export function useProfileSecurity() {
    const api = useApi();
    const messageBoxContext = getCurrentInstance()?.appContext;
    const auth = useAuth();
    const reauthentication = useReauthentication();
    const route = useRoute();
    const { t } = useI18n();
    const twoFactor = shallowRef<TwoFactorStatus | null>(null);
    const passkeys = shallowRef<PasskeySummary[] | null>(null);
    const twoFactorStatus = ref<ProfileRequestStatus>('idle');
    const passkeysStatus = ref<ProfileRequestStatus>('idle');
    const twoFactorError = ref('');
    const passkeysError = ref('');
    const passwordForm = reactive({ currentPassword: '', newPassword: '' });
    const passwordPending = ref(false);
    const passwordError = ref('');
    const passwordFields = ref<Record<string, string>>({});
    const passwordNotice = ref('');
    const setupMethod = ref<TwoFactorMethod | null>(null);
    const setupCode = ref('');
    const qrCodeDataUrl = ref('');
    const setupNeedsCancellation = ref(false);
    const setupPending = ref(false);
    const setupError = ref('');
    const setupNotice = ref('');
    const confirmPending = ref(false);
    const confirmError = ref('');
    const setupCodeError = ref('');
    const cancelPending = ref(false);
    const cancelError = ref('');
    const disablePending = ref(false);
    const disableError = ref('');
    const disableNotice = ref('');
    const passkeyName = ref('');
    const passkeyPending = ref(false);
    const credentialPending = ref(false);
    const passkeyError = ref('');
    const passkeyNameError = ref('');
    const passkeyNotice = ref('');
    const removingPasskeyId = ref('');
    const removeError = ref('');
    const removeNotice = ref('');
    const refreshPending = ref(false);
    const refreshError = ref('');
    let disposed = false;
    let waitingPurpose: ReauthPurpose | null = null;
    let authenticatorAbort: AbortController | null = null;
    let twoFactorRequest: Promise<void> | null = null;
    let passkeysRequest: Promise<void> | null = null;
    let loadRequest: Promise<void> | null = null;
    let cancelRequest: Promise<void> | null = null;
    let setupOperation: Promise<boolean> | null = null;
    let refreshRequest: Promise<boolean> | null = null;

    const status = computed<ProfileRequestStatus>(() => {
        const values = [twoFactorStatus.value, passkeysStatus.value];
        if (values.includes('pending')) return 'pending';
        if (values.includes('error')) return 'error';
        return values.every(value => value === 'success') ? 'success' : 'idle';
    });
    const error = computed(() =>
        [twoFactorError.value, passkeysError.value].filter(Boolean).join(' ')
    );
    const setupActive = computed(() => setupMethod.value !== null);
    const actionPending = computed(
        () =>
            passwordPending.value ||
            setupPending.value ||
            confirmPending.value ||
            cancelPending.value ||
            disablePending.value ||
            passkeyPending.value ||
            !!removingPasskeyId.value ||
            refreshPending.value
    );
    const pending = computed(() => actionPending.value || status.value === 'pending');
    const locked = computed(
        () => actionPending.value || setupActive.value || setupNeedsCancellation.value
    );
    const dirty = computed(
        () =>
            !!passwordForm.currentPassword ||
            !!passwordForm.newPassword ||
            !!passkeyName.value ||
            setupActive.value ||
            setupNeedsCancellation.value ||
            !!setupCode.value
    );
    const emailVerified = computed(() => auth.user.value?.emailVerified === true);

    function loadTwoFactor(force = false): Promise<void> {
        if (twoFactorRequest) return twoFactorRequest;
        if (disposed || (!force && twoFactorStatus.value === 'success')) return Promise.resolve();
        twoFactorStatus.value = 'pending';
        twoFactorError.value = '';
        twoFactorRequest = (async () => {
            try {
                const result = await api<TwoFactorStatus>('/api/auth/2fa/status');
                if (!disposed) {
                    twoFactor.value = result;
                    twoFactorStatus.value = 'success';
                }
            } catch (cause) {
                if (!disposed) {
                    twoFactorError.value = profileError(cause, t('identity.network_error'));
                    twoFactorStatus.value = 'error';
                }
            } finally {
                twoFactorRequest = null;
            }
        })();
        return twoFactorRequest;
    }

    function loadPasskeys(force = false): Promise<void> {
        if (passkeysRequest) return passkeysRequest;
        if (disposed || (!force && passkeysStatus.value === 'success')) return Promise.resolve();
        passkeysStatus.value = 'pending';
        passkeysError.value = '';
        passkeysRequest = (async () => {
            try {
                const result = await api<PasskeySummary[]>('/api/auth/passkey/credentials');
                if (!disposed) {
                    passkeys.value = result;
                    passkeysStatus.value = 'success';
                }
            } catch (cause) {
                if (!disposed) {
                    passkeysError.value = profileError(cause, t('identity.network_error'));
                    passkeysStatus.value = 'error';
                }
            } finally {
                passkeysRequest = null;
            }
        })();
        return passkeysRequest;
    }

    function load(force = false): Promise<void> {
        if (loadRequest) return loadRequest;
        loadRequest = Promise.all([loadTwoFactor(force), loadPasskeys(force)])
            .then(() => undefined)
            .finally(() => {
                loadRequest = null;
            });
        return loadRequest;
    }

    function refreshSession(): Promise<boolean> {
        if (refreshRequest) return refreshRequest;
        refreshPending.value = true;
        refreshError.value = '';
        refreshRequest = (async () => {
            try {
                auth.clearPending();
                await auth.load(true);
                if (auth.status.value !== 'authenticated') throw new Error();
                return true;
            } catch (cause) {
                refreshError.value = profileError(cause, t('identity.identity_unavailable'));
                return false;
            } finally {
                refreshPending.value = false;
                refreshRequest = null;
            }
        })();
        return refreshRequest;
    }

    async function proof(purpose: ReauthPurpose) {
        waitingPurpose = purpose;
        try {
            const token = await reauthentication.require(purpose);
            if (disposed) {
                if (token) reauthentication.consume(purpose, token);
                return null;
            }
            return token;
        } finally {
            waitingPurpose = null;
        }
    }

    function clearPassword() {
        passwordForm.currentPassword = '';
        passwordForm.newPassword = '';
        passwordFields.value = {};
    }

    function clearSetupSecrets() {
        setupMethod.value = null;
        setupCode.value = '';
        qrCodeDataUrl.value = '';
        setupCodeError.value = '';
    }

    function clearSecrets() {
        clearPassword();
        clearSetupSecrets();
    }

    async function changePassword(input: PasswordInput = passwordForm): Promise<boolean> {
        if (disposed || locked.value) return false;
        passwordError.value = '';
        passwordNotice.value = '';
        passwordFields.value = {};
        const parsed = newPasswordSchema.safeParse(input.newPassword);
        if (!parsed.success) {
            passwordFields.value = { newPassword: t('auth.flow.password_rule') };
            return false;
        }
        passwordPending.value = true;
        try {
            let token: string | null;
            if (input.currentPassword) {
                reauthentication.consume('password_change');
                const result = await api<AuthResult>('/api/auth/reauth', {
                    method: 'POST',
                    body: {
                        purpose: 'password_change',
                        method: 'password',
                        password: input.currentPassword,
                        redirect: getSafeRedirectTarget(route.fullPath)
                    }
                });
                passwordForm.currentPassword = '';
                if (disposed) return false;
                if ('requiresTwoFactor' in result) {
                    const request = proof('password_change');
                    if (!reauthentication.accept(result)) throw new Error();
                    token = await request;
                } else if ('reauthToken' in result && result.purpose === 'password_change') {
                    reauthentication.accept(result);
                    token = await proof('password_change');
                } else {
                    passwordError.value = t('reauth.invalid_result');
                    return false;
                }
            } else {
                token = await proof('password_change');
            }
            if (!token) {
                clearPassword();
                passwordNotice.value = t('reauth.cancelled');
                return false;
            }
            reauthentication.consume('password_change', token);
            await api('/api/auth/password/change', {
                method: 'POST',
                body: { newPassword: parsed.data, reauthToken: token }
            });
            clearPassword();
            passwordNotice.value = t('profile.security.password_updated');
            await refreshSession();
            return true;
        } catch (cause) {
            passwordError.value = profileError(cause, t('common.error'));
            passwordFields.value = profileFieldErrors(cause);
            if (failureCode(cause) === 'INVALID_REAUTH_CREDENTIAL') {
                passwordFields.value.currentPassword = passwordError.value;
            }
            return false;
        } finally {
            passwordPending.value = false;
        }
    }

    function cancelSetup(): Promise<void> {
        if (cancelRequest) return cancelRequest;
        const needed = setupNeedsCancellation.value || setupActive.value;
        clearSetupSecrets();
        if (!needed) return Promise.resolve();
        cancelPending.value = true;
        cancelError.value = '';
        cancelRequest = (async () => {
            try {
                await api('/api/auth/2fa/setup', { method: 'DELETE' });
                setupNeedsCancellation.value = false;
            } catch (cause) {
                setupNeedsCancellation.value = true;
                cancelError.value = profileError(cause, t('common.error'));
                throw cause;
            } finally {
                clearSetupSecrets();
                cancelPending.value = false;
                cancelRequest = null;
            }
        })();
        return cancelRequest;
    }

    function beginSetup(method: TwoFactorMethod): Promise<boolean> {
        if (disposed || actionPending.value) return Promise.resolve(false);
        setupError.value = '';
        setupNotice.value = '';
        confirmError.value = '';
        if (!twoFactor.value) {
            setupError.value = t('identity.network_error');
            return Promise.resolve(false);
        }
        if (method === 'email_otp' && !emailVerified.value) {
            setupError.value = t('profile.security.email_verified_required');
            return Promise.resolve(false);
        }
        setupPending.value = true;
        setupOperation = (async () => {
            try {
                if (twoFactor.value?.twoFactorEnabled) {
                    await ElMessageBox.confirm(
                        t('profile.security.replace_confirm', {
                            method: t(`profile.security.method_${method}`)
                        }),
                        t('profile.security.twofactor'),
                        {
                            type: 'warning',
                            confirmButtonText: t('profile.security.replace_factor'),
                            cancelButtonText: t('common.cancel')
                        },
                        messageBoxContext
                    );
                }
                if (disposed) return false;
                const token = await proof('mfa_change');
                if (!token) {
                    setupNotice.value = t('reauth.cancelled');
                    return false;
                }
                await cancelSetup();
                if (disposed) return false;
                reauthentication.consume('mfa_change', token);
                setupNeedsCancellation.value = true;
                if (method === 'email_otp') {
                    await api('/api/auth/2fa/setup/email/request', {
                        method: 'POST',
                        body: { reauthToken: token }
                    });
                    if (!disposed) setupNotice.value = t('profile.security.otp_sent');
                } else {
                    const result = await api<{ qrCodeDataUrl: string }>(
                        '/api/auth/2fa/setup/totp/request',
                        {
                            method: 'POST',
                            body: { reauthToken: token }
                        }
                    );
                    if (!disposed) qrCodeDataUrl.value = result.qrCodeDataUrl;
                }
                if (!disposed) setupMethod.value = method;
                return !disposed;
            } catch (cause) {
                if (cancelled(cause)) setupNotice.value = t('reauth.cancelled');
                else setupError.value = profileError(cause, t('common.error'));
                return false;
            } finally {
                setupPending.value = false;
                setupOperation = null;
            }
        })();
        return setupOperation;
    }

    function confirmSetup(code = setupCode.value): Promise<boolean> {
        const method = setupMethod.value;
        if (disposed || actionPending.value || !method) return Promise.resolve(false);
        confirmError.value = '';
        setupCodeError.value = '';
        if (!/^\d{6}$/.test(code.trim())) {
            setupCodeError.value = t('profile.security.code_invalid');
            return Promise.resolve(false);
        }
        confirmPending.value = true;
        setupOperation = (async () => {
            try {
                await api(
                    `/api/auth/2fa/setup/${method === 'email_otp' ? 'email' : 'totp'}/confirm`,
                    {
                        method: 'POST',
                        body: { code: code.trim() }
                    }
                );
                setupNeedsCancellation.value = false;
                clearSetupSecrets();
                twoFactor.value = { twoFactorEnabled: true, twoFactorMethod: method };
                setupNotice.value = t('profile.security.2fa_enabled');
                await refreshSession();
                await twoFactorRequest;
                await loadTwoFactor(true);
                return true;
            } catch (cause) {
                confirmError.value = profileError(cause, t('common.error'));
                setupCodeError.value =
                    profileFieldErrors(cause).code ||
                    (failureCode(cause) === 'INVALID_MFA_CODE' ? confirmError.value : '');
                return false;
            } finally {
                confirmPending.value = false;
                setupOperation = null;
            }
        })();
        return setupOperation;
    }

    async function disableTwoFactor(): Promise<boolean> {
        if (disposed || locked.value || !twoFactor.value?.twoFactorEnabled) return false;
        disablePending.value = true;
        disableError.value = '';
        disableNotice.value = '';
        try {
            await ElMessageBox.confirm(
                t('reauth.disable_confirm'),
                t('profile.security.twofactor'),
                {
                    type: 'warning',
                    confirmButtonText: t('profile.security.disable_2fa'),
                    cancelButtonText: t('common.cancel')
                },
                messageBoxContext
            );
            if (disposed) return false;
            const token = await proof('mfa_change');
            if (!token) {
                disableNotice.value = t('reauth.cancelled');
                return false;
            }
            reauthentication.consume('mfa_change', token);
            await api('/api/auth/2fa/disable', { method: 'POST', body: { reauthToken: token } });
            twoFactor.value = { twoFactorEnabled: false, twoFactorMethod: null };
            disableNotice.value = t('profile.security.2fa_disabled');
            await refreshSession();
            await twoFactorRequest;
            await loadTwoFactor(true);
            return true;
        } catch (cause) {
            if (cancelled(cause)) disableNotice.value = t('reauth.cancelled');
            else disableError.value = profileError(cause, t('common.error'));
            return false;
        } finally {
            disablePending.value = false;
        }
    }

    async function registerPasskey(name = passkeyName.value): Promise<boolean> {
        if (disposed || locked.value) return false;
        passkeyError.value = '';
        passkeyNameError.value = '';
        passkeyNotice.value = '';
        const label = name.trim();
        if (label.length > 100) {
            passkeyNameError.value = t('profile.security.passkey_name_invalid');
            return false;
        }
        if (
            typeof window === 'undefined' ||
            !window.PublicKeyCredential ||
            !navigator.credentials
        ) {
            passkeyError.value = t('auth.login.passkey_not_supported');
            return false;
        }
        passkeyPending.value = true;
        try {
            const token = await proof('passkey_add');
            if (!token) {
                passkeyNotice.value = t('reauth.cancelled');
                return false;
            }
            reauthentication.consume('passkey_add', token);
            const options = await api<PublicKeyCredentialCreationOptionsJSON>(
                '/api/auth/passkey/register/options',
                {
                    method: 'POST',
                    body: { reauthToken: token }
                }
            );
            if (disposed) return false;
            const publicKey = toCreationOptions(options);
            publicKey.authenticatorSelection = {
                ...publicKey.authenticatorSelection,
                userVerification: 'required'
            };
            authenticatorAbort = new AbortController();
            credentialPending.value = true;
            const credential = (await navigator.credentials.create({
                publicKey,
                signal: authenticatorAbort.signal
            })) as PublicKeyCredential | null;
            credentialPending.value = false;
            if (!credential) throw new DOMException('Cancelled', 'NotAllowedError');
            if (disposed || authenticatorAbort.signal.aborted) return false;
            await api('/api/auth/passkey/register/verify', {
                method: 'POST',
                body: {
                    ...(label ? { name: label } : {}),
                    response: serializeRegistrationCredential(credential)
                }
            });
            passkeyName.value = '';
            passkeyNotice.value = t('profile.security.passkey_added');
            await refreshSession();
            await passkeysRequest;
            await loadPasskeys(true);
            return true;
        } catch (cause) {
            if (cancelled(cause)) passkeyNotice.value = t('profile.security.passkey_cancelled');
            else {
                passkeyError.value = profileError(cause, t('common.error'));
                passkeyNameError.value = profileFieldErrors(cause).name || '';
            }
            return false;
        } finally {
            authenticatorAbort = null;
            credentialPending.value = false;
            passkeyPending.value = false;
        }
    }

    function abortRegistration() {
        authenticatorAbort?.abort();
    }

    async function removePasskey(id: string): Promise<boolean> {
        if (disposed || locked.value) return false;
        const target = passkeys.value?.find(item => item.id === id);
        if (!target) return false;
        removingPasskeyId.value = id;
        removeError.value = '';
        removeNotice.value = '';
        try {
            await ElMessageBox.confirm(
                t('reauth.delete_passkey', { name: target.name }),
                t('profile.security.passkeys'),
                {
                    type: 'warning',
                    confirmButtonText: t('profile.security.remove_passkey'),
                    cancelButtonText: t('common.cancel')
                },
                messageBoxContext
            );
            if (disposed) return false;
            const token = await proof('passkey_delete');
            if (!token) {
                removeNotice.value = t('reauth.cancelled');
                return false;
            }
            reauthentication.consume('passkey_delete', token);
            await api(`/api/auth/passkey/credentials/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: { 'X-CP-OAuth-Reauth': token }
            });
            if (passkeys.value) passkeys.value = passkeys.value.filter(item => item.id !== id);
            removeNotice.value = t('profile.security.passkey_removed', { name: target.name });
            await refreshSession();
            await passkeysRequest;
            await loadPasskeys(true);
            return true;
        } catch (cause) {
            if (cancelled(cause)) removeNotice.value = t('reauth.cancelled');
            else removeError.value = profileError(cause, t('common.error'));
            return false;
        } finally {
            removingPasskeyId.value = '';
        }
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        abortRegistration();
        if (waitingPurpose && reauthentication.purpose.value === waitingPurpose)
            reauthentication.cancel();
        clearSecrets();
        passkeyName.value = '';
        const runningSetup = setupOperation;
        void (async () => {
            await runningSetup;
            await cancelSetup();
        })().catch(() => {
            /* Normal departure awaits and exposes this failure through the task guard. */
        });
    }
    onBeforeUnmount(dispose);

    return {
        status,
        error,
        twoFactor,
        passkeys,
        twoFactorStatus,
        passkeysStatus,
        twoFactorError,
        passkeysError,
        load,
        loadTwoFactor,
        loadPasskeys,
        passwordForm,
        passwordPending,
        passwordError,
        passwordFields,
        passwordNotice,
        changePassword,
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
        beginSetup,
        confirmSetup,
        cancelSetup,
        disablePending,
        disableError,
        disableNotice,
        disableTwoFactor,
        passkeyName,
        passkeyPending,
        credentialPending,
        passkeyError,
        passkeyNameError,
        passkeyNotice,
        registerPasskey,
        abortRegistration,
        removingPasskeyId,
        removeError,
        removeNotice,
        removePasskey,
        refreshPending,
        refreshError,
        refreshSession,
        emailVerified,
        actionPending,
        pending,
        locked,
        dirty,
        clearPassword,
        clearSecrets,
        dispose
    };
}
