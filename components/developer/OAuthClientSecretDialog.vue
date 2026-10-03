<template>
    <el-dialog
        class="oauth-client-secret"
        :model-value="modelValue"
        :title="$t('developer.credentials_title')"
        width="min(520px, calc(100vw - 32px))"
        :close-on-click-modal="false"
        destroy-on-close
        @update:model-value="$emit('update:modelValue', $event)"
        @closed="closed"
    >
        <div v-if="secret" class="oauth-client-secret__content">
            <p :id="`${fieldId}-warning`" class="oauth-client-secret__warning">
                {{ $t('developer.secret_warning') }}
            </p>
            <p class="oauth-client-secret__hint">{{ $t('developer.secret_keep_private') }}</p>
            <div class="oauth-client-secret__field">
                <label :for="`${fieldId}-id`">{{ $t('developer.client_id') }}</label>
                <el-input
                    :id="`${fieldId}-id`"
                    :aria-label="$t('developer.client_id')"
                    :model-value="secret.clientId"
                    readonly
                />
                <el-button
                    native-type="button"
                    :disabled="!!copyPending"
                    :loading="copyPending === 'clientId'"
                    @click="copy('clientId')"
                >
                    <Copy :size="18" aria-hidden="true" />
                    {{ $t('developer.copy_client_id') }}
                </el-button>
            </div>
            <div class="oauth-client-secret__field">
                <label :for="`${fieldId}-secret`">{{ $t('developer.client_secret') }}</label>
                <el-input
                    :id="`${fieldId}-secret`"
                    :aria-label="$t('developer.client_secret')"
                    :model-value="secret.clientSecret"
                    type="textarea"
                    :rows="1"
                    :autosize="{ minRows: 1 }"
                    resize="none"
                    :spellcheck="false"
                    :aria-describedby="`${fieldId}-warning`"
                    readonly
                />
                <el-button
                    native-type="button"
                    :disabled="!!copyPending"
                    :loading="copyPending === 'clientSecret'"
                    @click="copy('clientSecret')"
                >
                    <Copy :size="18" aria-hidden="true" />
                    {{ $t('developer.copy_client_secret') }}
                </el-button>
            </div>
            <p v-if="copyError" class="oauth-client-secret__message" role="alert">
                {{ copyError }}
            </p>
            <p class="oauth-client-secret__message" role="status" aria-live="polite">
                {{ copyNotice }}
            </p>
        </div>
        <template #footer>
            <el-button
                type="primary"
                native-type="button"
                @click="$emit('update:modelValue', false)"
            >
                {{ $t('developer.dismiss') }}
            </el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { Copy } from 'lucide-vue-next';

const props = defineProps<{
    modelValue: boolean;
    secret: { clientId: string; clientSecret: string } | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; closed: [] }>();
const { t } = useI18n();
const fieldId = `oauth-secret-${useId()}`;
const copyPending = ref<'clientId' | 'clientSecret' | null>(null);
const copyError = ref('');
const copyNotice = ref('');
let copySequence = 0;

async function copy(field: 'clientId' | 'clientSecret') {
    if (!props.secret || copyPending.value) return;
    const sequence = ++copySequence;
    copyPending.value = field;
    copyError.value = '';
    copyNotice.value = '';
    try {
        await navigator.clipboard.writeText(props.secret[field]);
        if (sequence === copySequence && props.modelValue)
            copyNotice.value = t('developer.copy_success');
    } catch {
        if (sequence === copySequence && props.modelValue)
            copyError.value = t('developer.copy_error');
    } finally {
        if (sequence === copySequence) copyPending.value = null;
    }
}

function closed() {
    copySequence++;
    copyPending.value = null;
    copyError.value = '';
    copyNotice.value = '';
    emit('closed');
}
</script>

<style scoped lang="scss">
.oauth-client-secret {
    &__content {
        display: grid;
        gap: var(--space-4);
        min-width: 0;
    }

    &__warning {
        color: var(--text-primary);
        font-weight: 600;
    }

    &__hint {
        color: var(--text-secondary);
        font-size: 14px;
    }

    &__field {
        display: grid;
        gap: var(--space-2);
        min-width: 0;
    }

    label {
        font-size: 14px;
        font-weight: 600;
    }

    &__field :deep(.el-button) {
        justify-self: start;
    }

    &__message {
        color: var(--text-primary);
        font-size: 14px;
        overflow-wrap: anywhere;
    }

    &__message:empty {
        display: none;
    }

    :deep(input),
    :deep(textarea) {
        font-family: monospace;
        overflow-wrap: anywhere;
    }
}
</style>
