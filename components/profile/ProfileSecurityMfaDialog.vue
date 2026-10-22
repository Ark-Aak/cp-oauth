<template>
    <el-dialog
        :model-value="open"
        :title="method === 'totp' ? t('security.mfa.totpTitle') : t('security.mfa.emailTitle')"
        width="min(440px, calc(100vw - 32px))"
        append-to-body
        :close-on-click-modal="false"
        @update:model-value="value => !value && cancel()"
    >
        <div class="mfa-setup">
            <template v-if="method === 'totp'">
                <ol class="mfa-setup__steps">
                    <li>{{ t('security.mfa.totpStep1') }}</li>
                    <li>{{ t('security.mfa.totpStep2') }}</li>
                </ol>
                <img
                    v-if="qrCodeDataUrl"
                    class="mfa-setup__qr"
                    :src="qrCodeDataUrl"
                    :alt="t('security.mfa.qrAlt')"
                    width="200"
                    height="200"
                />
            </template>
            <p v-else class="cp-help">{{ t('security.mfa.emailStep') }}</p>

            <form class="mfa-setup__form" method="post" novalidate @submit.prevent="confirm">
                <label :for="codeId">{{ t('common.mfa.code') }}</label>
                <el-input
                    :id="codeId"
                    v-model="code"
                    name="one-time-code"
                    autocomplete="one-time-code"
                    inputmode="numeric"
                    maxlength="6"
                    class="mfa-setup__code"
                    :placeholder="t('common.mfa.codePlaceholder')"
                    :disabled="busy"
                />
                <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
                <div class="mfa-setup__actions">
                    <el-button :disabled="busy" @click="cancel">{{
                        t('common.actions.cancel')
                    }}</el-button>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="busy"
                        :disabled="!valid"
                    >
                        {{ t('security.mfa.enable') }}
                    </el-button>
                </div>
            </form>
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
import type { TwoFactorMethod } from '~/types/auth';

const props = defineProps<{
    open: boolean;
    method: TwoFactorMethod;
    qrCodeDataUrl?: string | null;
}>();
const emit = defineEmits<{ done: []; cancel: [] }>();

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();
const codeId = useId();
const code = ref('');
const busy = ref(false);
const error = ref('');
const valid = computed(() => /^\d{6}$/.test(code.value.trim()));

watch(
    () => props.open,
    value => {
        if (value) {
            code.value = '';
            error.value = '';
        }
    }
);

async function confirm() {
    if (!valid.value || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        const path = props.method === 'totp' ? 'totp' : 'email';
        await api(`/api/auth/2fa/setup/${path}/confirm`, {
            method: 'POST',
            body: { code: code.value.trim() }
        });
        emit('done');
    } catch (cause) {
        error.value = describe(cause);
        code.value = '';
    } finally {
        busy.value = false;
    }
}

/** Abandoning setup discards the pending enrolment on the server. */
async function cancel() {
    if (busy.value) return;
    try {
        await api('/api/auth/2fa/setup', { method: 'DELETE' });
    } catch {
        // The pending setup expires on its own after ten minutes.
    }
    emit('cancel');
}
</script>

<style scoped lang="scss">
.mfa-setup {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.mfa-setup__steps {
    padding-left: var(--cp-space-5);
    list-style: decimal;
    color: var(--cp-text-2);

    li + li {
        margin-top: var(--cp-space-1);
    }
}

.mfa-setup__qr {
    align-self: center;
    padding: var(--cp-space-2);
    background: #fff;
    border: 1px solid var(--cp-line);
    border-radius: var(--cp-radius-sm);
}

.mfa-setup__form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-2);

    label {
        font-size: var(--cp-text-sm);
        font-weight: var(--cp-weight-medium);
    }
}

.mfa-setup__code :deep(input) {
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-lg);
    letter-spacing: 0.3em;
}

.mfa-setup__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);
    margin-top: var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}
</style>
