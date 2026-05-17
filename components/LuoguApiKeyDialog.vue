<template>
    <el-dialog
        :model-value="modelValue"
        :title="dialogTitle"
        width="440px"
        :close-on-click-modal="false"
        @update:model-value="handleDialogModelUpdate"
    >
        <el-form v-if="step !== 'result'" :model="form" label-position="top">
            <el-form-item
                v-if="step === 'unlock'"
                :label="t('profile.security.luoguapi_unlock_password')"
            >
                <el-input
                    v-model="form.encryptPassword"
                    :placeholder="t('profile.security.luoguapi_unlock_password_placeholder')"
                    type="password"
                    show-password
                    autocomplete="current-password"
                    @keydown.enter="handleSubmit"
                />
            </el-form-item>

            <el-form-item v-else :label="t('profile.security.luoguapi_key_note')">
                <el-input
                    v-model="form.note"
                    :placeholder="t('profile.security.luoguapi_key_note_placeholder')"
                    maxlength="100"
                    show-word-limit
                    @keydown.enter="handleSubmit"
                />
            </el-form-item>
        </el-form>

        <template v-else>
            <el-alert
                type="warning"
                :title="t('profile.security.luoguapi_credential_once_warning')"
                :closable="false"
                show-icon
            />
            <div class="luogu-api-key-dialog__credential" @click="copyCredential">
                <label class="luogu-api-key-dialog__credential-label">
                    {{ t('profile.security.luoguapi_credential_value_label') }}
                </label>
                <code class="luogu-api-key-dialog__credential-code">{{ createdCredential }}</code>
            </div>
        </template>

        <template #footer>
            <div class="luogu-api-key-dialog__footer">
                <el-button v-if="step === 'result'" type="primary" @click="closeDialog">
                    {{ t('common.confirm') }}
                </el-button>
                <template v-else>
                    <el-button :disabled="submitting" @click="closeDialog">
                        {{ t('common.cancel') }}
                    </el-button>
                    <el-button
                        type="primary"
                        :loading="submitting"
                        :disabled="!canSubmit"
                        @click="handleSubmit"
                    >
                        {{ t('common.confirm') }}
                    </el-button>
                </template>
            </div>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';

type DialogStep = 'unlock' | 'create' | 'result';

type CreateKeyResponse = {
    keyId: string;
    keyBase32: string;
    note: string;
    tokenBase32: string;
};

const props = defineProps<{
    decryptReady: boolean;
}>();

const modelValue = defineModel<boolean>({ default: false });
const emit = defineEmits<{
    success: [];
}>();

const { t } = useI18n();
const token = useCookie('auth_token');

const submitting = ref(false);
const step = ref<DialogStep>('create');
const createdCredential = ref('');
const form = reactive({
    encryptPassword: '',
    note: ''
});

const dialogTitle = computed(() => {
    if (step.value === 'result') {
        return t('profile.security.luoguapi_credential_dialog_title');
    }
    return step.value === 'unlock'
        ? t('profile.security.luoguapi_unlock_title')
        : t('profile.security.luoguapi_create_key_title');
});

const canSubmit = computed(() => {
    if (step.value === 'unlock') {
        return Boolean(form.encryptPassword.trim());
    }
    return Boolean(form.note.trim() || form.note === '');
});

function resetFlow() {
    step.value = props.decryptReady ? 'create' : 'unlock';
    form.encryptPassword = '';
    form.note = '';
    createdCredential.value = '';
}

function closeDialog() {
    modelValue.value = false;
}

function handleDialogModelUpdate(value: boolean) {
    modelValue.value = value;
    if (!value) {
        resetFlow();
    }
}

function getAuthHeaders() {
    return {
        Authorization: `Bearer ${token.value}`
    };
}

function getErrorMessage(error: unknown): string {
    if (
        error &&
        typeof error === 'object' &&
        'data' in error &&
        error.data &&
        typeof error.data === 'object' &&
        'message' in error.data &&
        typeof error.data.message === 'string'
    ) {
        return error.data.message;
    }
    return t('common.error');
}

async function handleSubmit() {
    if (!canSubmit.value || submitting.value) {
        return;
    }

    submitting.value = true;
    try {
        if (step.value === 'unlock') {
            await $fetch('/api/luoguOpenApi/keys/unlock', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: {
                    encryptPassword: form.encryptPassword
                }
            });
            ElMessage.success(t('profile.security.luoguapi_unlock_success'));
            step.value = 'create';
            return;
        }

        const result = await $fetch<CreateKeyResponse>('/api/luoguOpenApi/keys', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: {
                note: form.note.trim()
            }
        });

        createdCredential.value = `${result.keyBase32}:${result.tokenBase32}`;
        navigator.clipboard.writeText(createdCredential.value);
        ElMessage.success(t('profile.security.luoguapi_create_key_success'));
        emit('success');
        step.value = 'result';
    } catch (error: unknown) {
        ElMessage.error(getErrorMessage(error));
    } finally {
        submitting.value = false;
    }
}

function copyCredential() {
    if (!createdCredential.value) return;
    navigator.clipboard.writeText(createdCredential.value);
    ElMessage.success(t('binding.code_copied'));
}

watch(
    () => modelValue.value,
    visible => {
        if (visible) {
            resetFlow();
        }
    }
);
</script>

<style scoped lang="scss">
.luogu-api-key-dialog__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.luogu-api-key-dialog__credential {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: pointer;
}

.luogu-api-key-dialog__credential-label {
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.luogu-api-key-dialog__credential-code {
    display: block;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--el-border-color);
    background: var(--el-fill-color-lighter);
    word-break: break-all;
}
</style>
