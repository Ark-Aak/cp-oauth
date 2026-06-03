<template>
    <el-dialog
        :model-value="modelValue"
        :title="t('profile.security.luoguapi')"
        width="460px"
        :close-on-click-modal="false"
        @update:model-value="handleDialogModelUpdate"
        @closed="handleDialogClosed"
    >
        <div class="luogu-api-login-dialog">
            <el-skeleton v-if="initializing" :rows="4" animated />

            <template v-else>
                <p class="luogu-api-login-dialog__desc">
                    {{ t('profile.security.luoguapi_setup_desc') }}
                </p>

                <el-form
                    v-if="step === 'login'"
                    :model="input"
                    label-position="top"
                    class="luogu-api-login-dialog__form"
                >
                    <el-form-item :label="t('profile.security.luoguapi_username')">
                        <el-input
                            v-model="input.username"
                            :placeholder="t('profile.security.luoguapi_username_placeholder')"
                            autocomplete="username"
                        />
                    </el-form-item>

                    <el-form-item :label="t('profile.security.luoguapi_password')">
                        <el-input
                            v-model="input.password"
                            :placeholder="t('profile.security.luoguapi_password_placeholder')"
                            type="password"
                            show-password
                            autocomplete="current-password"
                            @keydown.enter="handleLogin"
                        />
                    </el-form-item>

                    <el-form-item :label="t('profile.security.luoguapi_captcha')">
                        <div class="luogu-api-login-dialog__captcha-row">
                            <el-input
                                v-model="input.captcha"
                                :placeholder="t('profile.security.luoguapi_captcha_placeholder')"
                                @keydown.enter="handleLogin"
                            />
                            <img
                                v-if="captchaImageUrl"
                                :src="captchaImageUrl"
                                :alt="t('profile.security.luoguapi_captcha')"
                                class="luogu-api-login-dialog__captcha-image"
                                @click="fetchCaptchaImage"
                            />
                            <span v-else class="luogu-api-login-dialog__captcha-empty">
                                {{ t('profile.security.luoguapi_captcha_unavailable') }}
                            </span>
                        </div>
                    </el-form-item>
                </el-form>

                <el-form
                    v-else-if="step === '2fa'"
                    :model="input"
                    label-position="top"
                    class="luogu-api-login-dialog__form"
                >
                    <el-alert
                        type="warning"
                        :title="t('profile.security.luoguapi_need_2fa')"
                        :closable="false"
                        show-icon
                    />
                    <el-form-item :label="t('profile.security.luoguapi_2fa_code')">
                        <el-input
                            v-model="input.totpCode"
                            :placeholder="t('profile.security.luoguapi_2fa_code_placeholder')"
                            @keydown.enter="handleSubmit2fa"
                        />
                    </el-form-item>
                </el-form>

                <el-form
                    v-else
                    :model="input"
                    label-position="top"
                    class="luogu-api-login-dialog__form"
                >
                    <el-alert
                        type="info"
                        :title="t('profile.security.luoguapi_encrypt_password_desc')"
                        :closable="false"
                        show-icon
                    />
                    <el-form-item :label="t('profile.security.luoguapi_encrypt_password')">
                        <el-input
                            v-model="input.encryptPassword"
                            :placeholder="
                                t('profile.security.luoguapi_encrypt_password_placeholder')
                            "
                            type="password"
                            show-password
                            autocomplete="new-password"
                            @keydown.enter="handleBind"
                        />
                    </el-form-item>
                    <el-form-item :label="t('profile.security.luoguapi_encrypt_password_confirm')">
                        <el-input
                            v-model="input.encryptPasswordConfirm"
                            :placeholder="
                                t('profile.security.luoguapi_encrypt_password_confirm_placeholder')
                            "
                            type="password"
                            show-password
                            autocomplete="new-password"
                            @keydown.enter="handleBind"
                        />
                    </el-form-item>
                </el-form>
            </template>
        </div>

        <template #footer>
            <div class="luogu-api-login-dialog__footer">
                <el-button :disabled="submitting" @click="closeDialog">
                    {{ t('common.cancel') }}
                </el-button>
                <el-button
                    v-if="step === 'login'"
                    type="primary"
                    :loading="submitting"
                    :disabled="!canSubmitLogin"
                    @click="handleLogin"
                >
                    {{ t('common.confirm') }}
                </el-button>
                <el-button
                    v-else-if="step === '2fa'"
                    type="primary"
                    :loading="submitting"
                    :disabled="!input.totpCode.trim()"
                    @click="handleSubmit2fa"
                >
                    {{ t('common.confirm') }}
                </el-button>
                <el-button
                    v-else
                    type="primary"
                    :loading="submitting"
                    :disabled="!canSubmitBind"
                    @click="handleBind"
                >
                    {{ t('common.confirm') }}
                </el-button>
            </div>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';

type SetupLoginResponse = {
    uid: number;
    need2fa: boolean;
};

const modelValue = defineModel<boolean>({ default: false });
const emit = defineEmits<{ success: [] }>();

const { t } = useI18n();
const token = useCookie('auth_token');

const initializing = ref(false);
const submitting = ref(false);
const captchaLoading = ref(false);
const step = ref<'login' | '2fa' | 'bind'>('login');

const input = reactive({
    username: '',
    password: '',
    captcha: '',
    totpCode: '',
    encryptPassword: '',
    encryptPasswordConfirm: ''
});

const captchaImageUrl = ref('');

const canSubmitLogin = computed(() => {
    return Boolean(input.username.trim() && input.password.trim() && input.captcha.trim());
});

const canSubmitBind = computed(() => {
    return Boolean(
        input.encryptPassword &&
        input.encryptPasswordConfirm &&
        input.encryptPassword === input.encryptPasswordConfirm
    );
});

function getAuthHeaders() {
    return {
        Authorization: `Bearer ${token.value}`
    };
}

function getErrorMessage(error: unknown, fallbackKey = 'common.error'): string {
    if (
        error &&
        typeof error === 'object' &&
        'data' in error &&
        error.data &&
        typeof error.data === 'object'
    ) {
        if (
            'data' in error.data &&
            typeof error.data.data === 'object' &&
            error.data.data &&
            'luoguErrorMessage' in error.data.data &&
            typeof error.data.data.luoguErrorMessage === 'string'
        ) {
            return error.data.data.luoguErrorMessage;
        }
        if ('message' in error.data && typeof error.data.message === 'string') {
            return error.data.message;
        }
    }
    return t(fallbackKey);
}

function isTokenExpiredError(error: unknown) {
    return (
        error &&
        typeof error === 'object' &&
        'data' in error &&
        error.data &&
        typeof error.data === 'object' &&
        'message' in error.data &&
        typeof error.data.message === 'string' &&
        error.data.message === 'Token has expired or is invalid'
    );
}

function clearCaptchaImageUrl() {
    if (captchaImageUrl.value) {
        URL.revokeObjectURL(captchaImageUrl.value);
        captchaImageUrl.value = '';
    }
}

function resetFormState() {
    step.value = 'login';
    input.username = '';
    input.password = '';
    input.captcha = '';
    input.totpCode = '';
    input.encryptPassword = '';
    input.encryptPasswordConfirm = '';
}

function closeDialog() {
    modelValue.value = false;
}

function handleDialogModelUpdate(value: boolean) {
    modelValue.value = value;
}

async function fetchCaptchaImage() {
    captchaLoading.value = true;
    try {
        const response = await fetch('/api/luoguOpenApi/setup/captcha', {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            throw new Error('captcha fetch failed');
        }
        const blob = await response.blob();
        clearCaptchaImageUrl();
        captchaImageUrl.value = URL.createObjectURL(blob);
    } catch (error: unknown) {
        ElMessage.error(getErrorMessage(error));
    } finally {
        captchaLoading.value = false;
    }
}

async function beginSetup() {
    initializing.value = true;
    try {
        await $fetch('/api/luoguOpenApi/setup/begin', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        await fetchCaptchaImage();
    } catch (error: unknown) {
        ElMessage.error(getErrorMessage(error));
        closeDialog();
    } finally {
        initializing.value = false;
    }
}

async function handleLogin() {
    if (!canSubmitLogin.value || submitting.value) {
        return;
    }

    submitting.value = true;
    try {
        const result = await $fetch<SetupLoginResponse>('/api/luoguOpenApi/setup/login', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: {
                username: input.username.trim(),
                password: input.password,
                captcha: input.captcha.trim()
            }
        });

        if (result.need2fa) {
            step.value = '2fa';
            input.totpCode = '';
            input.captcha = '';
            await fetchCaptchaImage();
            return;
        }

        step.value = 'bind';
    } catch (error: unknown) {
        if (isTokenExpiredError(error)) {
            ElMessage.error(t('profile.security.luoguapi_session_expired'));
            input.captcha = '';
            await beginSetup();
            return;
        }

        ElMessage.error(getErrorMessage(error));
        input.captcha = '';
        await fetchCaptchaImage();
    } finally {
        submitting.value = false;
    }
}

async function handleSubmit2fa() {
    if (!input.totpCode.trim() || submitting.value) {
        return;
    }

    submitting.value = true;
    try {
        await $fetch('/api/luoguOpenApi/setup/2fa', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: { code: input.totpCode.trim() }
        });
        step.value = 'bind';
    } catch (error: unknown) {
        if (isTokenExpiredError(error)) {
            ElMessage.error(t('profile.security.luoguapi_session_expired'));
            step.value = 'login';
            input.totpCode = '';
            input.captcha = '';
            await beginSetup();
            return;
        }

        ElMessage.error(getErrorMessage(error));
        input.totpCode = '';
    } finally {
        submitting.value = false;
    }
}

async function handleBind() {
    if (!canSubmitBind.value || submitting.value) {
        return;
    }

    submitting.value = true;
    try {
        await $fetch('/api/luoguOpenApi/setup/end', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: {
                encryptPassword: input.encryptPassword
            }
        });
        await handleSuccess();
    } catch (error: unknown) {
        if (isTokenExpiredError(error)) {
            ElMessage.error(t('profile.security.luoguapi_session_expired'));
            resetFormState();
            await beginSetup();
            return;
        }

        ElMessage.error(getErrorMessage(error));
    } finally {
        submitting.value = false;
    }
}

async function handleSuccess() {
    emit('success');
    ElMessage.success(t('common.success'));
    closeDialog();
}

function handleDialogClosed() {
    resetFormState();
    clearCaptchaImageUrl();
}

watch(
    () => modelValue.value,
    async visible => {
        if (!visible) {
            return;
        }
        resetFormState();
        await beginSetup();
    }
);

onBeforeUnmount(() => {
    clearCaptchaImageUrl();
});
</script>

<style scoped lang="scss">
.luogu-api-login-dialog {
    &__desc {
        margin: 0 0 14px;
        color: var(--el-text-color-secondary);
        font-size: 14px;
        line-height: 1.6;
    }

    &__form {
        margin-top: 2px;
    }

    &__captcha-row {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    &__captcha-box {
        margin-top: 10px;
        border: 1px solid var(--el-border-color);
        border-radius: 10px;
        min-height: 84px;
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--el-fill-color-lighter);
    }

    &__captcha-image {
        max-width: 100%;
        max-height: 72px;
        object-fit: contain;
    }

    &__captcha-empty {
        color: var(--el-text-color-placeholder);
        font-size: 13px;
    }

    &__footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
}
</style>
