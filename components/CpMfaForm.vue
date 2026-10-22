<template>
    <form class="cp-mfa" method="post" novalidate @submit.prevent="submit">
        <p class="cp-help">
            {{ method === 'totp' ? t('common.mfa.totpHint') : t('common.mfa.emailHint') }}
        </p>
        <label class="cp-mfa__label" :for="inputId">{{ t('common.mfa.code') }}</label>
        <el-input
            :id="inputId"
            v-model="code"
            name="one-time-code"
            autocomplete="one-time-code"
            inputmode="numeric"
            maxlength="6"
            class="cp-mfa__input"
            :placeholder="t('common.mfa.codePlaceholder')"
            :disabled="!hydrated || busy"
        />
        <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
        <div class="cp-mfa__actions">
            <el-button :disabled="busy" @click="emit('cancel')">{{
                t('common.actions.back')
            }}</el-button>
            <el-button
                type="primary"
                native-type="submit"
                :loading="busy"
                :disabled="!hydrated || !valid"
            >
                {{ t('common.mfa.verify') }}
            </el-button>
        </div>
    </form>
</template>

<script setup lang="ts">
import type { AuthResult, TwoFactorMethod } from '~/types/auth';

const props = defineProps<{ challengeId: string; method: TwoFactorMethod }>();
const emit = defineEmits<{ done: [result: AuthResult]; cancel: [] }>();

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();
const hydrated = useHydrated();
const inputId = useId();
const code = ref('');
const busy = ref(false);
const error = ref('');
const valid = computed(() => /^\d{6}$/.test(code.value.trim()));

async function submit() {
    if (!valid.value || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        emit(
            'done',
            await api<AuthResult>('/api/auth/2fa/verify-login', {
                method: 'POST',
                body: { challengeId: props.challengeId, code: code.value.trim() }
            })
        );
    } catch (cause) {
        error.value = describe(cause);
        code.value = '';
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped lang="scss">
.cp-mfa {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-3);
}

.cp-mfa__label {
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
}

.cp-mfa__input :deep(input) {
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-lg);
    letter-spacing: 0.3em;
}

.cp-mfa__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);

    :deep(.el-button + .el-button) {
        margin-left: 0;
    }
}
</style>
