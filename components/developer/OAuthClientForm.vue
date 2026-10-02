<template>
    <el-form
        class="oauth-client-form"
        method="post"
        :disabled="controlsDisabled"
        label-position="top"
        novalidate
        :aria-busy="pending"
        @submit.prevent="submit"
    >
        <el-form-item
            :label="$t('developer.app_name')"
            :for="`${fieldId}-name`"
            :error="nameError"
            required
        >
            <el-input
                :id="`${fieldId}-name`"
                v-model="name"
                :aria-label="$t('developer.app_name')"
                autocomplete="off"
                :disabled="controlsDisabled"
                :aria-invalid="!!nameError"
                :aria-describedby="nameError ? `${fieldId}-name-error` : undefined"
                @input="nameError = ''"
            />
            <template #error>
                <p :id="`${fieldId}-name-error`" class="oauth-client-form__field-error">
                    {{ nameError }}
                </p>
            </template>
        </el-form-item>

        <fieldset class="oauth-client-form__callbacks" :disabled="controlsDisabled">
            <legend>{{ $t('developer.redirect_uris') }}</legend>
            <p :id="`${fieldId}-uri-hint`" class="oauth-client-form__hint">
                {{ $t('developer.redirect_uris_hint') }}
                {{ $t('developer.redirect_uri_invalid') }}
            </p>
            <div
                v-for="(row, index) in redirectRows"
                :key="row.id"
                class="oauth-client-form__uri-row"
            >
                <el-form-item
                    class="oauth-client-form__uri-field"
                    :label="$t('developer.redirect_uri_number', { number: index + 1 })"
                    :for="`${fieldId}-uri-${row.id}`"
                    :error="uriErrors[row.id] || ''"
                    required
                >
                    <el-input
                        :id="`${fieldId}-uri-${row.id}`"
                        v-model="row.value"
                        :aria-label="$t('developer.redirect_uri_number', { number: index + 1 })"
                        type="url"
                        autocomplete="off"
                        :spellcheck="false"
                        :disabled="controlsDisabled"
                        :placeholder="$t('developer.redirect_uri_placeholder')"
                        :aria-invalid="!!uriErrors[row.id]"
                        :aria-describedby="`${fieldId}-uri-hint${uriErrors[row.id] ? ` ${fieldId}-uri-${row.id}-error` : ''}`"
                        @input="delete uriErrors[row.id]"
                    />
                    <template #error>
                        <p
                            :id="`${fieldId}-uri-${row.id}-error`"
                            class="oauth-client-form__field-error"
                        >
                            {{ uriErrors[row.id] }}
                        </p>
                    </template>
                </el-form-item>
                <el-button
                    class="oauth-client-form__remove"
                    native-type="button"
                    plain
                    :disabled="controlsDisabled || redirectRows.length === 1"
                    :aria-label="$t('developer.remove_redirect_uri') + ' ' + (index + 1)"
                    @click="removeUri(index)"
                >
                    <Trash2 :size="18" aria-hidden="true" />
                </el-button>
            </div>
            <el-button
                native-type="button"
                :disabled="controlsDisabled || redirectRows.length >= 20"
                @click="addUri"
            >
                <Plus :size="18" aria-hidden="true" />
                {{ $t('developer.add_redirect_uri') }}
            </el-button>
            <p class="oauth-client-form__hint">{{ $t('developer.redirect_uri_limit') }}</p>
        </fieldset>

        <el-form-item>
            <el-checkbox v-model="requireEmailVerified" :disabled="controlsDisabled">
                {{ $t('developer.require_email_verified') }}
            </el-checkbox>
        </el-form-item>
        <p v-if="formError" class="oauth-client-form__error" role="alert">{{ formError }}</p>
        <div class="oauth-client-form__actions">
            <el-button native-type="button" :disabled="controlsDisabled" @click="$emit('cancel')">
                {{ $t('developer.cancel') }}
            </el-button>
            <el-button
                type="primary"
                native-type="submit"
                :disabled="controlsDisabled"
                :loading="pending"
            >
                {{ submitLabel }}
            </el-button>
        </div>
    </el-form>
</template>

<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next';
import type { OAuthClientDraft } from '~/types/api';
import { isSafeOAuthRedirectUri } from '~/utils/oauth-redirect';

const props = defineProps<{
    initial: OAuthClientDraft;
    submitLabel: string;
    pending: boolean;
}>();
const emit = defineEmits<{ submit: [draft: OAuthClientDraft]; cancel: [] }>();
const { t } = useI18n();
const hydrationReady = useHydrationReady();
const controlsDisabled = computed(() => props.pending || !hydrationReady.value);
const fieldId = `oauth-client-${useId()}`;
let rowSequence = 0;
const name = ref('');
const redirectRows = ref<Array<{ id: number; value: string }>>([]);
const requireEmailVerified = ref(false);
const nameError = ref('');
const uriErrors = ref<Record<number, string>>({});
const formError = ref('');

function reset(initial: OAuthClientDraft) {
    name.value = initial.name;
    redirectRows.value = (initial.redirectUris.length ? initial.redirectUris : ['']).map(value => ({
        id: rowSequence++,
        value
    }));
    requireEmailVerified.value = initial.requireEmailVerified;
    nameError.value = '';
    uriErrors.value = {};
    formError.value = '';
}
watch(() => props.initial, reset, { immediate: true });

async function focusField(id: string) {
    await nextTick();
    if (import.meta.client) document.getElementById(id)?.focus();
}

function focusFirstField() {
    void focusField(`${fieldId}-name`);
}

async function addUri() {
    if (controlsDisabled.value || redirectRows.value.length >= 20) return;
    const id = rowSequence++;
    redirectRows.value.push({ id, value: '' });
    await focusField(`${fieldId}-uri-${id}`);
}

async function removeUri(index: number) {
    if (controlsDisabled.value || redirectRows.value.length <= 1) return;
    const removed = redirectRows.value.splice(index, 1)[0];
    if (removed) Reflect.deleteProperty(uriErrors.value, removed.id);
    const nextRow = redirectRows.value[Math.min(index, redirectRows.value.length - 1)];
    if (nextRow) await focusField(`${fieldId}-uri-${nextRow.id}`);
}

function focusFirstError() {
    if (nameError.value) return focusFirstField();
    const invalidRow =
        redirectRows.value.find(row => uriErrors.value[row.id]) ||
        (formError.value ? redirectRows.value[0] : undefined);
    if (invalidRow) void focusField(`${fieldId}-uri-${invalidRow.id}`);
}

function setFieldErrors(fields: Record<string, string>) {
    for (const key of Object.keys(fields)) {
        if (key === 'name') nameError.value = t('developer.app_name_invalid');
        else if (/^redirectUris\.\d+$/.test(key)) {
            const row = redirectRows.value[Number(key.split('.')[1])];
            if (row) uriErrors.value[row.id] = t('developer.redirect_uri_invalid');
        } else formError.value = t('developer.form_invalid');
    }
    focusFirstError();
}

function submit() {
    if (controlsDisabled.value) return;
    nameError.value = '';
    uriErrors.value = {};
    formError.value = '';
    const trimmedName = name.value.trim();
    if (!trimmedName || trimmedName.length > 100) {
        nameError.value = t('developer.app_name_invalid');
    }
    if (redirectRows.value.length < 1 || redirectRows.value.length > 20) {
        formError.value = t('developer.redirect_uri_limit');
    }
    for (const row of redirectRows.value) {
        const uri = row.value.trim();
        if (!uri) uriErrors.value[row.id] = t('developer.redirect_uri_required');
        else if (uri.length > 2048) uriErrors.value[row.id] = t('developer.redirect_uri_long');
        else if (!isSafeOAuthRedirectUri(uri)) {
            uriErrors.value[row.id] = t('developer.redirect_uri_invalid');
        }
    }
    if (nameError.value || Object.keys(uriErrors.value).length || formError.value) {
        focusFirstError();
        return;
    }
    emit('submit', {
        name: trimmedName,
        redirectUris: [...new Set(redirectRows.value.map(row => row.value.trim()))],
        requireEmailVerified: requireEmailVerified.value
    });
}

defineExpose({ setFieldErrors, focusFirstField });
</script>

<style scoped lang="scss">
.oauth-client-form {
    min-width: 0;

    &__callbacks {
        min-width: 0;
        margin: 0 0 var(--space-5);
        padding: 0;
        border: 0;
    }

    legend {
        font-size: 14px;
        font-weight: 600;
    }

    &__hint {
        margin: var(--space-2) 0 var(--space-4);
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.5;
    }

    &__uri-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 44px;
        gap: var(--space-2);
        align-items: start;
    }

    &__uri-field {
        min-width: 0;
    }

    &__remove {
        margin-top: 30px;
        min-width: 44px;
        padding: 0;
    }

    &__error {
        margin-bottom: var(--space-4);
        color: var(--text-primary);
        overflow-wrap: anywhere;
    }

    &__actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: var(--space-2);
    }

    &__actions :deep(.el-button) {
        margin: 0;
    }

    :deep(.el-form-item__error) {
        position: static;
        font-size: 14px;
        line-height: 1.5;
        width: 100%;
    }

    :deep(.el-checkbox) {
        height: auto;
        min-height: 44px;
        align-items: flex-start;
        padding-block: var(--space-3);
    }

    :deep(.el-checkbox__input) {
        margin-top: 3px;
    }

    :deep(.el-checkbox__label) {
        white-space: normal;
        overflow-wrap: anywhere;
    }

    &__field-error {
        width: 100%;
        padding-top: var(--space-1);
        color: var(--text-primary);
        font-size: 14px;
        line-height: 1.5;
        overflow-wrap: anywhere;
    }

    @media (max-width: 480px) {
        &__actions {
            flex-direction: column-reverse;
        }

        &__actions :deep(.el-button) {
            width: 100%;
        }
    }
}
</style>
