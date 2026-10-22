<template>
    <el-dialog
        :model-value="open"
        :title="client ? t('developer.form.editTitle') : t('developer.form.createTitle')"
        width="min(560px, calc(100vw - 32px))"
        append-to-body
        :close-on-click-modal="false"
        @update:model-value="value => !value && close()"
    >
        <form class="client-form" method="post" novalidate @submit.prevent="submit">
            <div class="client-form__field">
                <label :for="ids.name">{{ t('developer.form.name') }}</label>
                <el-input :id="ids.name" v-model="name" maxlength="100" :disabled="busy" />
                <p v-if="fieldErrors.name" class="client-form__error">{{ fieldErrors.name }}</p>
            </div>

            <fieldset class="client-form__uris">
                <legend>{{ t('developer.form.redirectUris') }}</legend>
                <p class="cp-help">{{ t('developer.form.redirectRule') }}</p>
                <div v-for="(_, index) in uris" :key="index" class="client-form__uri">
                    <el-input
                        v-model="uris[index]"
                        type="url"
                        inputmode="url"
                        spellcheck="false"
                        placeholder="https://app.example.com/callback"
                        :aria-label="t('developer.form.redirectUriN', { n: index + 1 })"
                        :disabled="busy"
                        class="cp-mono"
                    />
                    <el-button
                        :disabled="busy || uris.length === 1"
                        :aria-label="t('developer.form.removeUri', { n: index + 1 })"
                        @click="uris.splice(index, 1)"
                    >
                        <X :size="14" aria-hidden="true" />
                    </el-button>
                    <p v-if="uriError(index)" class="client-form__error client-form__uri-error">
                        {{ uriError(index) }}
                    </p>
                </div>
                <el-button
                    class="client-form__add"
                    :disabled="busy || uris.length >= 20"
                    @click="uris.push('')"
                >
                    {{ t('developer.form.addUri') }}
                </el-button>
            </fieldset>

            <div class="client-form__switch">
                <div>
                    <p class="client-form__label">{{ t('developer.form.requireVerified') }}</p>
                    <p class="cp-help">{{ t('developer.form.requireVerifiedText') }}</p>
                </div>
                <el-switch
                    v-model="requireEmailVerified"
                    :aria-label="t('developer.form.requireVerified')"
                    :disabled="busy"
                />
            </div>

            <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
            <div class="client-form__actions">
                <el-button :disabled="busy" @click="close">{{
                    t('common.actions.cancel')
                }}</el-button>
                <el-button
                    type="primary"
                    native-type="submit"
                    :loading="busy"
                    :disabled="!valid || (client !== null && !dirty)"
                >
                    {{ client ? t('common.actions.saveChanges') : t('developer.form.create') }}
                </el-button>
            </div>
        </form>
    </el-dialog>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import type { OAuthClient } from '~/types/api';
import { isSafeOAuthRedirectUri } from '~/utils/oauth-redirect';

const props = defineProps<{ open: boolean; client: OAuthClient | null }>();
const emit = defineEmits<{
    close: [];
    saved: [client: OAuthClient & { clientSecret?: string }];
}>();

const { t } = useI18n();
const api = useApi();
const { describe, read } = useApiError();
const ids = { name: useId() };

const name = ref('');
const uris = ref<string[]>(['']);
const requireEmailVerified = ref(false);
const busy = ref(false);
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});

watch(
    () => props.open,
    value => {
        if (!value) return;
        name.value = props.client?.name ?? '';
        uris.value = props.client ? [...props.client.redirectUris] : [''];
        requireEmailVerified.value = props.client?.requireEmailVerified ?? false;
        error.value = '';
        fieldErrors.value = {};
    },
    { immediate: true }
);

const cleanUris = computed(() => [...new Set(uris.value.map(uri => uri.trim()).filter(Boolean))]);

function uriError(index: number): string {
    const server = fieldErrors.value[`redirectUris.${index}`];
    if (server) return server;
    const value = uris.value[index]?.trim() ?? '';
    return value && !isSafeOAuthRedirectUri(value) ? t('developer.form.uriInvalid') : '';
}

const valid = computed(
    () =>
        name.value.trim().length > 0 &&
        cleanUris.value.length > 0 &&
        cleanUris.value.every(uri => isSafeOAuthRedirectUri(uri))
);

const patch = computed(() => {
    const body: Partial<Pick<OAuthClient, 'name' | 'redirectUris' | 'requireEmailVerified'>> = {};
    if (!props.client) return body;
    if (name.value.trim() !== props.client.name) body.name = name.value.trim();
    if (cleanUris.value.join('\n') !== props.client.redirectUris.join('\n'))
        body.redirectUris = cleanUris.value;
    if (requireEmailVerified.value !== props.client.requireEmailVerified) {
        body.requireEmailVerified = requireEmailVerified.value;
    }
    return body;
});
const dirty = computed(() => Object.keys(patch.value).length > 0);

function close() {
    if (!busy.value) emit('close');
}

async function submit() {
    if (!valid.value) return;
    busy.value = true;
    error.value = '';
    fieldErrors.value = {};
    try {
        const saved = props.client
            ? await api<OAuthClient>(`/api/oauth/clients/${encodeURIComponent(props.client.id)}`, {
                  method: 'PATCH',
                  body: patch.value
              })
            : await api<OAuthClient & { clientSecret: string }>('/api/oauth/clients', {
                  method: 'POST',
                  body: {
                      name: name.value.trim(),
                      redirectUris: cleanUris.value,
                      requireEmailVerified: requireEmailVerified.value
                  }
              });
        emit('saved', saved);
    } catch (cause) {
        const info = read(cause);
        fieldErrors.value = { ...info.fields };
        if (!Object.keys(info.fields).length) error.value = describe(cause);
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped lang="scss">
.client-form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.client-form__field {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-1);

    label {
        font-size: var(--cp-text-sm);
        font-weight: var(--cp-weight-medium);
        color: var(--cp-text);
    }
}

.client-form__uris {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-2);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;

    legend {
        padding: 0;
        margin-bottom: var(--cp-space-1);
        font-size: var(--cp-text-sm);
        font-weight: var(--cp-weight-medium);
        color: var(--cp-text);
    }
}

.client-form__uri {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--cp-space-1) var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}

.client-form__uri-error {
    grid-column: 1 / -1;
}

.client-form__add {
    align-self: flex-start;
}

.client-form__switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cp-space-4);
    padding-top: var(--cp-space-3);
    border-top: 1px solid var(--cp-line);
}

.client-form__label {
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text);
}

.client-form__error {
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-danger);
}

.client-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}
</style>
