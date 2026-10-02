<template>
    <div class="admin-config">
        <AppPageHeader
            :title="$t('admin.config.tab')"
            :description="$t('admin.workbench.config_description')"
        >
            <template #actions>
                <el-button
                    type="primary"
                    native-type="button"
                    :loading="saving"
                    :disabled="!clientReady || saving || !loaded || !hasChanges || formLoading"
                    @click="handleSave"
                >
                    {{ saving ? $t('admin.config.saving') : $t('admin.config.save') }}
                </el-button>
            </template>
        </AppPageHeader>
        <AdminSectionNav current="config" />
        <p v-if="sessionExpired" class="admin-config__help">
            <NuxtLink :to="loginPath">{{ $t('auth.login.submit') }}</NuxtLink>
        </p>

        <AppAsyncState :pending="formLoading" :error="loadError" @retry="loadConfig">
            <div class="admin-config__editor">
                <p v-if="saveNotice" class="admin-config__notice" role="status">{{ saveNotice }}</p>
                <div
                    v-if="saveError"
                    id="config-save-error"
                    class="admin-config__error"
                    tabindex="-1"
                    role="alert"
                >
                    <p>{{ saveError }}</p>
                </div>
                <p v-if="secretNotice" class="admin-config__help" role="status">
                    {{ secretNotice }}
                </p>
                <el-form
                    method="post"
                    label-position="top"
                    :disabled="!clientReady || saving || !loaded"
                    @submit.prevent="handleSave"
                >
                    <section
                        v-for="group in groups"
                        :key="group.id"
                        class="admin-config__group"
                        :aria-labelledby="`config-group-${group.id}`"
                    >
                        <h2 :id="`config-group-${group.id}`">{{ $t(group.title) }}</h2>
                        <p v-if="group.id === 'providers'" class="admin-config__help">
                            {{ $t('admin.config.provider_hint') }}
                        </p>
                        <p v-if="group.id === 'site'" class="admin-config__help">
                            {{ $t('admin.config.registration_hint') }}
                        </p>
                        <div
                            v-for="(block, index) in group.blocks"
                            :key="index"
                            class="admin-config__block"
                        >
                            <h3 v-if="block.title">{{ $t(block.title) }}</h3>
                            <p v-if="block.provider" class="admin-config__help">
                                {{
                                    $t(
                                        providerReady(block.provider)
                                            ? 'admin.config.provider_ready'
                                            : 'admin.config.provider_incomplete'
                                    )
                                }}
                            </p>
                            <el-form-item
                                v-for="field in block.fields"
                                :key="field.key"
                                :for="`config-${field.key}`"
                                :label="$t(field.label)"
                                :error="fieldErrors[field.key]"
                            >
                                <template v-if="field.kind === 'secret'">
                                    <el-input
                                        :id="`config-${field.key}`"
                                        v-model="secretDrafts[field.key]"
                                        :aria-label="$t(field.label)"
                                        type="password"
                                        show-password
                                        autocomplete="new-password"
                                        :disabled="
                                            !clientReady ||
                                            saving ||
                                            !loaded ||
                                            clearSecret[field.key]
                                        "
                                        :placeholder="$t('admin.config.secret_leave_empty')"
                                        :aria-invalid="!!fieldErrors[field.key]"
                                        :aria-describedby="describedBy(field.key)"
                                        @input="touch(field.key)"
                                        @blur="touch(field.key)"
                                    />
                                    <p
                                        :id="`config-${field.key}-help`"
                                        class="admin-config__secret-status"
                                    >
                                        {{
                                            $t(
                                                secretState[field.key].configured
                                                    ? 'admin.config.secret_configured'
                                                    : 'admin.config.secret_not_configured'
                                            )
                                        }}
                                    </p>
                                    <el-checkbox
                                        v-model="clearSecret[field.key]"
                                        :disabled="
                                            !clientReady ||
                                            saving ||
                                            !loaded ||
                                            !secretState[field.key].configured ||
                                            !!secretDrafts[field.key]
                                        "
                                        :aria-label="`${$t('admin.config.clear_secret')}: ${$t(field.label)}`"
                                        @change="touch(field.key)"
                                    >
                                        {{ $t('admin.config.clear_secret') }}
                                    </el-checkbox>
                                </template>
                                <el-select
                                    v-else-if="field.input === 'boolean'"
                                    :id="`config-${field.key}`"
                                    v-model="form[field.key]"
                                    :aria-label="$t(field.label)"
                                    :disabled="!clientReady || saving || !loaded"
                                    :aria-invalid="!!fieldErrors[field.key]"
                                    :aria-describedby="describedBy(field.key)"
                                    @change="touch(field.key)"
                                >
                                    <el-option value="true" :label="$t('admin.config.enabled')" />
                                    <el-option value="false" :label="$t('admin.config.disabled')" />
                                </el-select>
                                <template v-else>
                                    <el-input
                                        :id="`config-${field.key}`"
                                        v-model="form[field.key]"
                                        :aria-label="$t(field.label)"
                                        :disabled="!clientReady || saving || !loaded"
                                        :inputmode="
                                            field.input === 'integer' ? 'numeric' : undefined
                                        "
                                        :aria-invalid="!!fieldErrors[field.key]"
                                        :aria-describedby="describedBy(field.key)"
                                        @input="touch(field.key)"
                                        @blur="touch(field.key)"
                                    />
                                    <p
                                        v-if="field.input === 'integer'"
                                        :id="`config-${field.key}-help`"
                                        class="admin-config__help"
                                    >
                                        {{
                                            $t('admin.config.integer_range', {
                                                min: field.min,
                                                max: field.max
                                            })
                                        }}
                                    </p>
                                </template>
                                <template #error="{ error }"
                                    ><span :id="`config-${field.key}-error`">{{
                                        error
                                    }}</span></template
                                >
                            </el-form-item>
                        </div>
                    </section>

                    <section
                        class="admin-config__summary"
                        aria-labelledby="config-summary-title"
                        aria-live="polite"
                    >
                        <h2 id="config-summary-title">{{ $t('admin.config.change_summary') }}</h2>
                        <p class="admin-config__help">{{ $t('admin.config.secret_rules') }}</p>
                        <ul v-if="changes.length" class="admin-config__changes">
                            <li v-for="change in changes" :key="change.key">
                                {{ $t(change.label) }} — {{ $t(change.action) }}
                            </li>
                        </ul>
                        <p v-else class="admin-config__help">{{ $t('admin.config.no_changes') }}</p>
                        <ul
                            v-if="formErrors.length"
                            id="config-form-errors"
                            class="admin-config__error"
                            role="alert"
                        >
                            <li v-for="message in formErrors" :key="message">{{ message }}</li>
                        </ul>
                        <div class="admin-config__actions">
                            <el-button
                                native-type="button"
                                :disabled="!clientReady || saving || !hasChanges"
                                @click="discardChanges"
                                >{{ $t('admin.workbench.discard') }}</el-button
                            >
                            <el-button
                                type="primary"
                                native-type="submit"
                                :loading="saving"
                                :disabled="!clientReady || saving || !hasChanges"
                            >
                                {{ saving ? $t('admin.config.saving') : $t('admin.config.save') }}
                            </el-button>
                        </div>
                    </section>
                </el-form>
            </div>
        </AppAsyncState>
    </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { onBeforeRouteLeave } from 'vue-router';
import AdminSectionNav from '~/components/admin/AdminSectionNav.vue';
import { adminRequestError } from '~/utils/admin-feedback';
import { buildLoginPath } from '~/utils/auth-redirect';
import type {
    AdminConfigPatch,
    AdminConfigResponse,
    ConfigKey,
    PublicConfigKey,
    SecretConfigKey
} from '~/types/config';

type ValueField = {
    kind: 'value';
    key: PublicConfigKey;
    label: string;
    input?: 'boolean' | 'integer';
    min?: number;
    max?: number;
};
type SecretField = { kind: 'secret'; key: SecretConfigKey; label: string };
type ConfigField = ValueField | SecretField;
type Provider = 'codeforces' | 'clist' | 'github' | 'google';
type ConfigBlock = { title?: string; provider?: Provider; fields: ConfigField[] };

definePageMeta({ middleware: 'admin' });
const { t } = useI18n();
useHead({ title: () => `${t('admin.config.tab')} - CP OAuth` });
const api = useApi();
const route = useRoute();
const loginPath = computed(() => buildLoginPath(route.fullPath));
const sessionExpired = ref(false);

const groups: { id: string; title: string; blocks: ConfigBlock[] }[] = [
    {
        id: 'site',
        title: 'admin.config.site',
        blocks: [
            {
                fields: [
                    { kind: 'value', key: 'site_title', label: 'admin.config.site_title' },
                    {
                        kind: 'value',
                        key: 'registration_enabled',
                        label: 'admin.config.registration',
                        input: 'boolean'
                    },
                    {
                        kind: 'value',
                        key: 'home_recent_users_count',
                        label: 'admin.config.home_recent_users_count',
                        input: 'integer',
                        min: 1,
                        max: 20
                    }
                ]
            }
        ]
    },
    {
        id: 'mail',
        title: 'admin.config.smtp',
        blocks: [
            {
                fields: [
                    { kind: 'value', key: 'smtp_host', label: 'admin.config.smtp_host' },
                    {
                        kind: 'value',
                        key: 'smtp_port',
                        label: 'admin.config.smtp_port',
                        input: 'integer',
                        min: 1,
                        max: 65535
                    },
                    { kind: 'value', key: 'smtp_user', label: 'admin.config.smtp_user' },
                    { kind: 'secret', key: 'smtp_pass', label: 'admin.config.smtp_pass' },
                    { kind: 'value', key: 'smtp_from', label: 'admin.config.smtp_from' }
                ]
            }
        ]
    },
    {
        id: 'turnstile',
        title: 'admin.config.turnstile',
        blocks: [
            {
                fields: [
                    {
                        kind: 'value',
                        key: 'turnstile_enabled',
                        label: 'admin.config.turnstile_toggle',
                        input: 'boolean'
                    },
                    {
                        kind: 'value',
                        key: 'turnstile_site_key',
                        label: 'admin.config.turnstile_site_key'
                    },
                    {
                        kind: 'secret',
                        key: 'turnstile_secret_key',
                        label: 'admin.config.turnstile_secret'
                    }
                ]
            }
        ]
    },
    {
        id: 'providers',
        title: 'admin.config.providers',
        blocks: [
            {
                title: 'admin.config.codeforces',
                provider: 'codeforces',
                fields: [
                    {
                        kind: 'value',
                        key: 'codeforces_client_id',
                        label: 'admin.config.codeforces_client_id'
                    },
                    {
                        kind: 'secret',
                        key: 'codeforces_client_secret',
                        label: 'admin.config.codeforces_client_secret'
                    }
                ]
            },
            {
                title: 'admin.config.clist',
                provider: 'clist',
                fields: [
                    {
                        kind: 'value',
                        key: 'clist_client_id',
                        label: 'admin.config.clist_client_id'
                    },
                    {
                        kind: 'secret',
                        key: 'clist_client_secret',
                        label: 'admin.config.clist_client_secret'
                    }
                ]
            },
            {
                title: 'admin.config.github',
                provider: 'github',
                fields: [
                    {
                        kind: 'value',
                        key: 'github_client_id',
                        label: 'admin.config.github_client_id'
                    },
                    {
                        kind: 'secret',
                        key: 'github_client_secret',
                        label: 'admin.config.github_client_secret'
                    }
                ]
            },
            {
                title: 'admin.config.google',
                provider: 'google',
                fields: [
                    {
                        kind: 'value',
                        key: 'google_client_id',
                        label: 'admin.config.google_client_id'
                    },
                    {
                        kind: 'secret',
                        key: 'google_client_secret',
                        label: 'admin.config.google_client_secret'
                    }
                ]
            }
        ]
    },
    {
        id: 'platforms',
        title: 'admin.config.platform',
        blocks: [
            {
                fields: [
                    {
                        kind: 'value',
                        key: 'username_refresh_cooldown',
                        label: 'admin.config.username_refresh_cooldown',
                        input: 'integer',
                        min: 1,
                        max: 43200
                    }
                ]
            }
        ]
    }
];
const fields = groups.flatMap(group => group.blocks.flatMap(block => block.fields));
const valueFields = fields.filter((field): field is ValueField => field.kind === 'value');
const secretFields = fields.filter((field): field is SecretField => field.kind === 'secret');
const publicKeys = valueFields.map(field => field.key);
const secretKeys = secretFields.map(field => field.key);
const form = reactive(
    Object.fromEntries(publicKeys.map(key => [key, ''])) as Record<PublicConfigKey, string>
);
const secretDrafts = reactive(
    Object.fromEntries(secretKeys.map(key => [key, ''])) as Record<SecretConfigKey, string>
);
const secretState = reactive(
    Object.fromEntries(
        secretKeys.map(key => [key, { configured: false }])
    ) as AdminConfigResponse['secrets']
);
const clearSecret = reactive(
    Object.fromEntries(secretKeys.map(key => [key, false])) as Record<SecretConfigKey, boolean>
);
const savedValues = ref<Record<PublicConfigKey, string> | null>(null);
const saving = ref(false);
const clientReady = ref(false);
const formLoading = ref(false);
const loaded = ref(false);
const loadError = ref('');
const saveError = ref('');
const saveNotice = ref('');
const secretNotice = ref('');
const serverFields = ref<Record<string, string>>({});
const touched = reactive<Record<string, boolean>>({});
const submitted = ref(false);

const changes = computed(() => {
    const list: { key: ConfigKey; label: string; action: string }[] = [];
    if (!savedValues.value) return list;
    for (const field of valueFields) {
        if (form[field.key] !== savedValues.value[field.key]) {
            list.push({ key: field.key, label: field.label, action: 'admin.config.change_value' });
        }
    }
    for (const field of secretFields) {
        if (secretDrafts[field.key] || clearSecret[field.key]) {
            list.push({
                key: field.key,
                label: field.label,
                action: clearSecret[field.key]
                    ? 'admin.config.clear_secret'
                    : 'admin.config.replace_secret'
            });
        }
    }
    return list;
});
const hasChanges = computed(() => changes.value.length > 0);
const localErrors = computed(() => {
    const errors: Record<string, string> = {};
    if (!savedValues.value) return errors;
    for (const field of valueFields) {
        const value = form[field.key];
        if (value === savedValues.value[field.key]) continue;
        if (value.length > 2048)
            errors[field.key] = t('admin.workbench.max_characters', { max: 2048 });
        else if (field.input === 'boolean' && value !== 'true' && value !== 'false') {
            errors[field.key] = t('admin.workbench.choose_valid');
        } else if (
            field.input === 'integer' &&
            (!/^\d+$/.test(value) ||
                !Number.isSafeInteger(Number(value)) ||
                Number(value) < field.min! ||
                Number(value) > field.max!)
        ) {
            errors[field.key] = t('admin.config.integer_range', { min: field.min, max: field.max });
        }
    }
    for (const key of secretKeys) {
        if (secretDrafts[key].length > 2048)
            errors[key] = t('admin.workbench.max_characters', { max: 2048 });
        if (secretDrafts[key] && clearSecret[key]) errors[key] = t('admin.config.secret_conflict');
    }
    if (
        hasChanges.value &&
        form.turnstile_enabled === 'true' &&
        (!form.turnstile_site_key.trim() || !secretAvailable('turnstile_secret_key'))
    ) {
        errors.turnstile_enabled = t('admin.config.turnstile_requires_keys');
    }
    return errors;
});
const fieldErrors = computed(() => {
    const errors: Record<string, string> = { ...serverFields.value };
    for (const [key, message] of Object.entries(localErrors.value)) {
        if (submitted.value || touched[key]) errors[key] = message;
    }
    return errors;
});
const formErrors = computed(() =>
    Object.entries(serverFields.value)
        .filter(([key]) => !fields.some(field => field.key === key))
        .map(([, message]) => message)
);

function secretAvailable(key: SecretConfigKey) {
    return (
        !clearSecret[key] &&
        (secretDrafts[key] ? !!secretDrafts[key].trim() : secretState[key].configured)
    );
}

function providerReady(provider: Provider) {
    return !!form[`${provider}_client_id`].trim() && secretAvailable(`${provider}_client_secret`);
}

function describedBy(key: ConfigKey) {
    const field = fields.find(item => item.key === key);
    return (
        [
            field?.kind === 'secret' || (field?.kind === 'value' && field.input === 'integer')
                ? `config-${key}-help`
                : '',
            fieldErrors.value[key] ? `config-${key}-error` : ''
        ]
            .filter(Boolean)
            .join(' ') || undefined
    );
}

function touch(key: ConfigKey) {
    touched[key] = true;
    if (key.startsWith('turnstile_')) touched.turnstile_enabled = true;
    Reflect.deleteProperty(serverFields.value, key);
    delete serverFields.value.turnstile_enabled;
    saveError.value = '';
    saveNotice.value = '';
    secretNotice.value = '';
}

function wipeSecretInputs() {
    for (const key of secretKeys) secretDrafts[key] = '';
}

function clearSecretDrafts() {
    wipeSecretInputs();
    for (const key of secretKeys) clearSecret[key] = false;
}

function acceptConfig(data: AdminConfigResponse) {
    Object.assign(form, data.values);
    Object.assign(secretState, data.secrets);
    savedValues.value = { ...data.values };
    clearSecretDrafts();
    serverFields.value = {};
    for (const key of Object.keys(touched)) Reflect.deleteProperty(touched, key);
    submitted.value = false;
    loaded.value = true;
}

function requestError(error: unknown) {
    const failure = adminRequestError(
        error,
        t('identity.network_error'),
        t('identity.permission_denied')
    );
    const response = error as {
        response?: { status?: number };
        statusCode?: number;
        status?: number;
    };
    const status = response.response?.status ?? response.statusCode ?? response.status;
    if (status === 401) {
        failure.message = t('admin.workbench.session_expired');
        sessionExpired.value = true;
    }
    if (status === 409) failure.message = t('admin.workbench.conflict');
    return failure;
}

let controller: AbortController | undefined;
let sequence = 0;
async function loadConfig() {
    if (saving.value || hasChanges.value) return;
    controller?.abort();
    controller = new AbortController();
    const current = ++sequence;
    formLoading.value = true;
    loadError.value = '';
    try {
        const data = await api<AdminConfigResponse>('/api/admin/config', {
            signal: controller.signal
        });
        if (current === sequence) {
            acceptConfig(data);
            sessionExpired.value = false;
        }
    } catch (error) {
        if (current === sequence) loadError.value = requestError(error).message;
    } finally {
        if (current === sequence) formLoading.value = false;
    }
}

async function focusError() {
    await nextTick();
    const field = fields.find(item => fieldErrors.value[item.key]);
    const target =
        (field ? document.getElementById(`config-${field.key}`) : null) ||
        document.getElementById('config-save-error');
    target?.focus();
    target?.scrollIntoView({ block: 'center' });
}

async function handleSave() {
    if (!clientReady.value || saving.value || !loaded.value || !hasChanges.value) return;
    submitted.value = true;
    serverFields.value = {};
    saveError.value = '';
    saveNotice.value = '';
    secretNotice.value = '';
    if (Object.keys(localErrors.value).length) {
        saveError.value = t('admin.workbench.validation_error');
        await focusError();
        return;
    }
    const values: NonNullable<AdminConfigPatch['values']> = {};
    for (const key of publicKeys) {
        if (form[key] !== savedValues.value![key]) values[key] = form[key];
    }
    const secrets: NonNullable<AdminConfigPatch['secrets']> = {};
    for (const key of secretKeys) {
        if (secretDrafts[key]) secrets[key] = secretDrafts[key];
    }
    const clearSecrets = secretKeys.filter(key => clearSecret[key]);
    const body: AdminConfigPatch = {};
    if (Object.keys(values).length) body.values = values;
    if (Object.keys(secrets).length) body.secrets = secrets;
    if (clearSecrets.length) body.clearSecrets = clearSecrets;
    const changeCount = changes.value.length;
    let attempted = false;
    let failed = false;
    saving.value = true;
    try {
        if (clearSecrets.length) {
            const names = secretFields
                .filter(field => clearSecrets.includes(field.key))
                .map(field => t(field.label))
                .join(', ');
            try {
                await ElMessageBox.confirm(
                    t('admin.config.clear_confirm', { fields: names }),
                    t('common.confirm'),
                    {
                        confirmButtonText: t('admin.config.save'),
                        cancelButtonText: t('common.cancel'),
                        type: 'warning'
                    }
                );
            } catch {
                return;
            }
        }
        attempted = true;
        const data = await api<AdminConfigResponse>('/api/admin/config', { method: 'PATCH', body });
        acceptConfig(data);
        saveNotice.value = t('admin.config.saved_summary', { count: changeCount });
        ElMessage.success(t('admin.config.saved'));
    } catch (error) {
        failed = true;
        const failure = requestError(error);
        saveError.value = failure.message;
        serverFields.value = Object.fromEntries(
            Object.entries(failure.fields).map(([key, message]) => [
                key.replace(/^(values|secrets)\./, ''),
                message
            ])
        );
    } finally {
        saving.value = false;
        if (attempted) {
            wipeSecretInputs();
            if (failed && Object.keys(secrets).length)
                secretNotice.value = t('admin.config.secret_reenter');
        }
        if (failed) await focusError();
    }
}

let confirmingDiscard = false;
async function confirmDiscard() {
    if (saving.value) {
        ElMessage.warning(t('admin.config.wait_for_save'));
        return false;
    }
    if (!hasChanges.value) return true;
    if (confirmingDiscard) return false;
    confirmingDiscard = true;
    try {
        await ElMessageBox.confirm(t('admin.workbench.discard_changes'), t('common.confirm'), {
            confirmButtonText: t('admin.workbench.discard'),
            cancelButtonText: t('common.cancel'),
            type: 'warning'
        });
        return true;
    } catch {
        return false;
    } finally {
        confirmingDiscard = false;
    }
}

async function discardChanges() {
    if (!(await confirmDiscard()) || !savedValues.value) return;
    acceptConfig({ values: savedValues.value, secrets: { ...secretState } });
    saveError.value = '';
    saveNotice.value = '';
    secretNotice.value = '';
}

onBeforeRouteLeave(async () => {
    const leave = await confirmDiscard();
    if (leave) clearSecretDrafts();
    return leave;
});

function beforeUnload(event: BeforeUnloadEvent) {
    if (!hasChanges.value && !saving.value) return;
    event.preventDefault();
    event.returnValue = '';
}
onMounted(() => {
    clientReady.value = true;
    window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
    sequence++;
    controller?.abort();
    window.removeEventListener('beforeunload', beforeUnload);
    clearSecretDrafts();
});

await loadConfig();
</script>

<style scoped lang="scss">
.admin-config {
    min-width: 0;

    &__editor {
        max-width: 680px;
    }

    &__group {
        padding: var(--space-5) 0 var(--space-2);
        border-bottom: 1px solid var(--border-color);

        &:first-child {
            padding-top: 0;
        }
        h2 {
            margin-bottom: var(--space-4);
        }
    }

    &__block {
        min-width: 0;

        h3 {
            margin: var(--space-5) 0 var(--space-3);
        }
    }

    &__help,
    &__secret-status {
        width: 100%;
        margin: var(--space-2) 0;
        color: var(--text-secondary);
        font-size: 14px;
        overflow-wrap: anywhere;
    }

    &__summary {
        padding-top: var(--space-5);
    }

    &__changes {
        padding-left: var(--space-5);
        margin: var(--space-3) 0 var(--space-4);
        overflow-wrap: anywhere;
    }

    &__notice {
        margin-bottom: var(--space-4);
        color: var(--text-primary);
    }

    &__error {
        color: var(--el-color-danger);
        overflow-wrap: anywhere;
        margin-bottom: var(--space-4);
    }

    &__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-top: var(--space-4);
    }
}
</style>
