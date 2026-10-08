<template>
    <el-dialog
        :model-value="modelValue"
        :title="dialogTitle"
        width="min(560px, calc(100vw - 32px))"
        :show-close="!busy"
        :close-on-click-modal="!busy"
        :close-on-press-escape="!busy"
        :before-close="attemptClose"
        destroy-on-close
        @update:model-value="handleModelValue"
        @open="handleOpened"
        @closed="handleClosed"
        @open-auto-focus="focusFirstField"
        @close-auto-focus="restoreFocus"
    >
        <div class="profile-binding-dialog" :aria-busy="busy">
            <template v-if="finished">
                <p class="profile-binding-dialog__success" role="status">
                    {{ t('binding.verify_success') }}
                </p>
                <div v-if="identityError" class="profile-binding-dialog__error" role="alert">
                    <p>{{ identityError }}</p>
                    <el-button
                        native-type="button"
                        :loading="identityPending"
                        :disabled="busy"
                        @click="retryIdentity"
                    >
                        {{ t('common.retry') }}
                    </el-button>
                </div>
            </template>
            <template v-else>
                <p
                    v-if="formError"
                    :id="`${id}-error`"
                    class="profile-binding-dialog__error"
                    role="alert"
                >
                    {{ formError }}
                </p>
                <p v-if="notice" class="profile-binding-dialog__hint" role="status">
                    {{ notice }}
                </p>

                <div v-if="expired" class="profile-binding-dialog__restart">
                    <el-button
                        :id="`${id}-restart`"
                        native-type="button"
                        :disabled="busy"
                        @click="restartChallenge"
                    >
                        {{ t('binding.workbench.restart_challenge') }}
                    </el-button>
                </div>
                <form
                    v-else-if="!requestId"
                    class="profile-binding-dialog__form"
                    method="post"
                    @submit.prevent="requestChallenge"
                >
                    <h3>{{ t('binding.workbench.account_identity') }}</h3>
                    <p :id="`${id}-uid-hint`" class="profile-binding-dialog__hint">
                        {{ t(stepOneDescription, { platform: platformName }) }}
                    </p>
                    <div class="profile-binding-dialog__field">
                        <label :for="`${id}-uid`">{{ uidLabel }}</label>
                        <el-input
                            :id="`${id}-uid`"
                            v-model="uid"
                            :aria-label="uidLabel"
                            :disabled="busy"
                            :inputmode="platform === 'luogu' ? 'numeric' : 'text'"
                            autocomplete="off"
                            :maxlength="100"
                            :aria-invalid="Boolean(uidError)"
                            :aria-describedby="
                                [
                                    `${id}-uid-hint`,
                                    uidError ? `${id}-uid-error` : '',
                                    formError ? `${id}-error` : ''
                                ]
                                    .filter(Boolean)
                                    .join(' ')
                            "
                        />
                        <p
                            v-if="uidError"
                            :id="`${id}-uid-error`"
                            class="profile-binding-dialog__error"
                            role="alert"
                        >
                            {{ uidError }}
                        </p>
                    </div>
                    <div class="profile-binding-dialog__actions">
                        <el-button
                            native-type="submit"
                            type="primary"
                            :loading="mutation === 'request'"
                            :disabled="busy || !platform"
                        >
                            {{
                                t(
                                    mutation === 'request'
                                        ? 'binding.getting_code'
                                        : 'binding.get_code'
                                )
                            }}
                        </el-button>
                    </div>
                </form>
                <form
                    v-else
                    class="profile-binding-dialog__form"
                    method="post"
                    @submit.prevent="verifyChallenge"
                >
                    <h3>{{ t('binding.step2_title') }}</h3>
                    <p :id="`${id}-verify-hint`" class="profile-binding-dialog__hint">
                        {{ t(stepTwoDescription, { platform: platformName }) }}
                    </p>
                    <p class="profile-binding-dialog__identity">
                        <span>{{ uidLabel }}:</span>
                        <strong>{{ requestedUid }}</strong>
                    </p>
                    <p v-if="platform === 'atcoder'" class="profile-binding-dialog__hint">
                        {{ t('binding.atcoder_settings_guide') }}
                        <a
                            class="profile-binding-dialog__link"
                            href="https://atcoder.jp/settings"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            https://atcoder.jp/settings
                        </a>
                    </p>
                    <p
                        v-if="platform === 'atcoder' && locale === 'zh'"
                        class="profile-binding-dialog__hint"
                    >
                        {{ t('binding.atcoder_cn_plugin_hint') }}
                    </p>
                    <div class="profile-binding-dialog__field">
                        <label :for="`${id}-code`">{{ t('binding.code_label') }}</label>
                        <div class="profile-binding-dialog__copy-row">
                            <el-input
                                :id="`${id}-code`"
                                :model-value="code"
                                :aria-label="t('binding.code_label')"
                                :disabled="!mounted"
                                readonly
                                autocomplete="off"
                                :aria-describedby="
                                    [`${id}-expiry`, copyError ? `${id}-copy-error` : '']
                                        .filter(Boolean)
                                        .join(' ')
                                "
                            />
                            <el-button
                                native-type="button"
                                :loading="copyPending"
                                :disabled="busy || copyPending"
                                @click="copyCode"
                            >
                                {{ t('reauth.copy') }}
                            </el-button>
                        </div>
                        <p :id="`${id}-expiry`" class="profile-binding-dialog__hint">
                            {{ t('binding.code_expires', { minutes: remainingMinutes }) }}
                        </p>
                        <p v-if="copyNotice" class="profile-binding-dialog__hint" role="status">
                            {{ copyNotice }}
                        </p>
                        <p
                            v-if="copyError"
                            :id="`${id}-copy-error`"
                            class="profile-binding-dialog__error"
                            role="alert"
                        >
                            {{ copyError }}
                        </p>
                    </div>
                    <div v-if="platform === 'luogu'" class="profile-binding-dialog__field">
                        <label :for="`${id}-credential`">
                            {{ t('binding.workbench.clipboard_label') }}
                        </label>
                        <el-input
                            :id="`${id}-credential`"
                            v-model="credential"
                            :aria-label="t('binding.workbench.clipboard_label')"
                            :disabled="busy"
                            autocomplete="off"
                            :maxlength="2048"
                            :aria-invalid="Boolean(credentialError)"
                            :aria-describedby="
                                [
                                    `${id}-verify-hint`,
                                    credentialError ? `${id}-credential-error` : '',
                                    formError ? `${id}-error` : ''
                                ]
                                    .filter(Boolean)
                                    .join(' ')
                            "
                        />
                        <p
                            v-if="credentialError"
                            :id="`${id}-credential-error`"
                            class="profile-binding-dialog__error"
                            role="alert"
                        >
                            {{ credentialError }}
                        </p>
                    </div>
                    <div class="profile-binding-dialog__actions">
                        <el-button
                            :id="`${id}-verify`"
                            native-type="submit"
                            type="primary"
                            :loading="mutation === 'verify'"
                            :disabled="busy"
                            :aria-describedby="`${id}-verify-hint`"
                        >
                            {{ t(mutation === 'verify' ? 'binding.verifying' : 'binding.verify') }}
                        </el-button>
                        <el-button native-type="button" :disabled="busy" @click="restartChallenge">
                            {{ t('binding.workbench.restart_challenge') }}
                        </el-button>
                    </div>
                </form>
            </template>
        </div>
        <template #footer>
            <el-button native-type="button" :disabled="busy" @click="attemptClose()">
                {{ t(finished ? 'binding.workbench.close' : 'common.cancel') }}
            </el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import {
    computed,
    getCurrentInstance,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    useId,
    watch
} from 'vue';
import { ElMessageBox } from 'element-plus';
import { useProfileBindings } from '~/composables/useProfileBindings';
import { profileError } from './profile-workbench';
import type { VerifiablePlatform } from '~/utils/platforms';

const props = defineProps<{ modelValue: boolean; platform: VerifiablePlatform | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; completed: [] }>();
const { t, locale } = useI18n();
const messageBoxContext = getCurrentInstance()?.appContext;
const id = useId();
const binding = useProfileBindings();
const {
    pending,
    mutation,
    mutationError,
    fieldErrors,
    challengeExpired,
    notice,
    identityError,
    identityPending
} = binding;
const uid = ref('');
const requestedUid = ref('');
const credential = ref('');
const requestId = ref('');
const code = ref('');
const expiresAt = ref(0);
const now = ref(Date.now());
const expired = ref(false);
const finished = ref(false);
const localError = ref<string | null>(null);
const inputErrors = ref<{ uid?: string; credential?: string }>({});
const copyPending = ref(false);
const copyError = ref<string | null>(null);
const copyNotice = ref<string | null>(null);
const confirmingClose = ref(false);
const mounted = ref(false);
const busy = computed(() => !mounted.value || pending.value || confirmingClose.value);
const dirty = computed(
    () =>
        props.modelValue &&
        !finished.value &&
        Boolean(uid.value || credential.value || requestId.value || code.value)
);
const platformName = computed(() =>
    props.platform ? t(`binding.platforms.${props.platform}`) : ''
);
const dialogTitle = computed(() => t('binding.dialog_title', { platform: platformName.value }));
const uidLabel = computed(() =>
    props.platform === 'luogu' ? t('auth.flow.luogu_uid') : t('profile.username')
);
const stepOneDescription = computed(() =>
    props.platform === 'atcoder'
        ? 'binding.step1_desc_atcoder'
        : props.platform === 'leetcode'
          ? 'binding.step1_desc_leetcode'
          : 'binding.step1_desc'
);
const stepTwoDescription = computed(() =>
    props.platform === 'atcoder'
        ? 'binding.step2_desc_atcoder'
        : props.platform === 'leetcode'
          ? 'binding.step2_desc_leetcode'
          : 'binding.step2_desc'
);
const uidError = computed(() => inputErrors.value.uid || fieldErrors.value.platformUid);
const credentialError = computed(
    () => inputErrors.value.credential || fieldErrors.value.credential
);
const formError = computed(() =>
    expired.value
        ? t('binding.workbench.challenge_expired')
        : localError.value || mutationError.value
);
const remainingMinutes = computed(() =>
    Math.max(1, Math.ceil((expiresAt.value - now.value) / 60_000))
);
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let epoch = 0;
let opener: HTMLElement | null = null;
let returnFocus = true;
let closed = true;
let closePromise: Promise<void> | null = null;
let resolveClose: (() => void) | null = null;

function clearChallenge() {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    requestId.value = '';
    code.value = '';
    credential.value = '';
    requestedUid.value = '';
    expiresAt.value = 0;
    copyPending.value = false;
    copyError.value = null;
    copyNotice.value = null;
}

function clearPrivateState() {
    epoch += 1;
    binding.cancelPendingProof();
    clearChallenge();
    uid.value = '';
    expired.value = false;
    finished.value = false;
    localError.value = null;
    inputErrors.value = {};
    copyPending.value = false;
}

function expireChallenge() {
    clearChallenge();
    expired.value = true;
    localError.value = null;
    inputErrors.value = {};
    void nextTick(() => {
        if (props.modelValue && !busy.value) document.getElementById(`${id}-restart`)?.focus();
    });
}

function scheduleExpiry() {
    now.value = Date.now();
    const remaining = expiresAt.value - now.value;
    if (remaining <= 0) {
        expireChallenge();
        return;
    }
    expiryTimer = setTimeout(scheduleExpiry, Math.min(remaining, 30_000));
}

async function focusFirstField(event?: Event) {
    event?.preventDefault();
    await nextTick();
    if (!props.modelValue || busy.value) return;
    const target = expired.value
        ? 'restart'
        : requestId.value
          ? props.platform === 'luogu'
              ? 'credential'
              : 'verify'
          : 'uid';
    document.getElementById(`${id}-${target}`)?.focus();
}

async function requestChallenge() {
    if (busy.value || !props.platform || expired.value) return;
    inputErrors.value = {};
    localError.value = null;
    const normalizedUid = uid.value.trim();
    if (!normalizedUid) {
        inputErrors.value.uid = t('binding.workbench.identity_required');
    } else if (
        props.platform === 'luogu' &&
        (!/^\d{1,20}$/.test(normalizedUid) || !/[1-9]/.test(normalizedUid))
    ) {
        inputErrors.value.uid = t('auth.flow.luogu_uid_invalid');
    }
    if (inputErrors.value.uid) {
        await focusFirstField();
        return;
    }
    const current = epoch;
    const platform = props.platform;
    try {
        const challenge = await binding.requestBind(platform, normalizedUid);
        if (!challenge || current !== epoch || !props.modelValue) return;
        uid.value = normalizedUid;
        requestedUid.value = normalizedUid;
        requestId.value = challenge.requestId;
        code.value = challenge.code;
        expiresAt.value = challenge.expiresAt;
        scheduleExpiry();
        await focusFirstField();
    } catch (cause) {
        if (current !== epoch || !props.modelValue) return;
        if (!mutationError.value) localError.value = profileError(cause, t('binding.verify_error'));
        await focusFirstField();
    }
}

async function verifyChallenge() {
    if (busy.value || !requestId.value || !props.platform) return;
    if (Date.now() >= expiresAt.value) {
        expireChallenge();
        return;
    }
    localError.value = null;
    inputErrors.value = {};
    if (props.platform === 'luogu' && !credential.value.trim()) {
        inputErrors.value.credential = t('binding.workbench.clipboard_required');
        await focusFirstField();
        return;
    }
    const current = epoch;
    const proofCredential =
        props.platform === 'atcoder'
            ? ''
            : props.platform === 'leetcode'
              ? requestedUid.value
              : credential.value.trim();
    try {
        const account = await binding.verifyBind(requestId.value, proofCredential);
        if (!account || current !== epoch || !props.modelValue) return;
        clearPrivateState();
        finished.value = true;
        emit('completed');
        if (!identityError.value) emit('update:modelValue', false);
    } catch (cause) {
        if (current !== epoch || !props.modelValue) return;
        if (challengeExpired.value) expireChallenge();
        else if (!mutationError.value)
            localError.value = profileError(cause, t('binding.verify_error'));
        await focusFirstField();
    }
}

async function copyCode() {
    if (!code.value || copyPending.value || busy.value) return;
    const current = epoch;
    copyPending.value = true;
    copyError.value = null;
    copyNotice.value = null;
    try {
        await navigator.clipboard.writeText(code.value);
        if (current === epoch && props.modelValue && requestId.value) {
            copyNotice.value = t('binding.code_copied');
        }
    } catch {
        if (current === epoch && props.modelValue && requestId.value) {
            copyError.value = t('auth.flow.copy_error');
        }
    } finally {
        if (current === epoch) copyPending.value = false;
    }
}

async function restartChallenge() {
    if (busy.value) return;
    epoch += 1;
    binding.cancelPendingProof();
    clearChallenge();
    expired.value = false;
    localError.value = null;
    inputErrors.value = {};
    await focusFirstField();
}

async function attemptClose(done?: () => void) {
    if (busy.value) return;
    const trigger = document.activeElement as HTMLElement | null;
    if (dirty.value) {
        let accepted = false;
        confirmingClose.value = true;
        try {
            await ElMessageBox.confirm(
                t('binding.workbench.discard_challenge'),
                dialogTitle.value,
                {
                    type: 'warning',
                    confirmButtonText: t('profile.workbench.discard'),
                    cancelButtonText: t('common.cancel'),
                    closeOnClickModal: false
                },
                messageBoxContext
            );
            accepted = true;
        } catch (cause) {
            if (cause !== 'cancel' && cause !== 'close') {
                localError.value = profileError(cause, t('common.error'));
            }
        } finally {
            confirmingClose.value = false;
        }
        if (!accepted) {
            await nextTick();
            if (trigger?.isConnected) trigger.focus();
            return;
        }
    }
    clearPrivateState();
    if (done) done();
    else emit('update:modelValue', false);
}

function handleModelValue(value: boolean) {
    if (!value) clearPrivateState();
    emit('update:modelValue', value);
}

async function retryIdentity() {
    if (busy.value) return;
    if (await binding.refreshIdentity()) emit('update:modelValue', false);
}

async function restoreFocus(event?: Event) {
    event?.preventDefault();
    await nextTick();
    if (returnFocus && opener?.isConnected && !opener.hasAttribute('disabled')) opener.focus();
}

function discard() {
    if (busy.value) throw new Error(t('profile.workbench.wait_for_action'));
    returnFocus = false;
    clearPrivateState();
    emit('update:modelValue', false);
}

function waitUntilClosed(): Promise<void> {
    if (closed) return Promise.resolve();
    closePromise ??= new Promise<void>(resolve => {
        resolveClose = resolve;
    });
    return closePromise;
}

function handleOpened() {
    closed = false;
}

function handleClosed() {
    closed = true;
    resolveClose?.();
    closePromise = null;
    resolveClose = null;
}

watch(
    () => [props.modelValue, props.platform] as const,
    ([open], previous) => {
        clearPrivateState();
        if (open && (!previous?.[0] || previous[1] !== props.platform)) {
            returnFocus = true;
            opener = import.meta.client ? (document.activeElement as HTMLElement | null) : null;
        }
    },
    { immediate: true }
);
onMounted(() => {
    mounted.value = true;
});
onBeforeUnmount(() => {
    clearPrivateState();
    handleClosed();
});
defineExpose({ dirty, pending: busy, discard, waitUntilClosed });
</script>

<style scoped lang="scss">
.profile-binding-dialog {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
    max-width: 680px;

    &__form {
        display: grid;
        gap: var(--space-4);
    }

    &__field {
        display: grid;
        gap: var(--space-2);
        min-width: 0;
    }

    &__field label {
        color: var(--text-primary);
        font-weight: 600;
        font-size: var(--font-size-control);
    }

    &__hint {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        overflow-wrap: anywhere;
    }

    &__error {
        color: var(--el-color-danger);
        font-size: var(--font-size-control);
        overflow-wrap: anywhere;
    }

    &__error .el-button {
        margin-top: var(--space-3);
    }

    &__success {
        color: var(--text-primary);
    }

    &__identity {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        color: var(--text-secondary);
        overflow-wrap: anywhere;
    }

    &__identity strong {
        color: var(--text-primary);
    }

    &__copy-row {
        display: flex;
        gap: var(--space-2);
        align-items: flex-start;
        min-width: 0;
    }

    &__copy-row .el-input {
        min-width: 0;
    }

    &__copy-row :deep(input) {
        font-family: var(--font-code);
    }

    &__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }

    &__actions .el-button + .el-button {
        margin-left: 0;
    }

    &__link {
        display: inline-block;
        min-height: 44px;
        padding: var(--space-2) 0;
        overflow-wrap: anywhere;
    }

    @media (max-width: 480px) {
        &__copy-row {
            flex-direction: column;
        }
    }
}
</style>
