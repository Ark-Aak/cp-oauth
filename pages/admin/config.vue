<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.admin')"
            :title="t('common.nav.adminConfig')"
            :description="t('admin.config.description')"
        />

        <CpDataState
            :pending="pending"
            :error="error ? describe(error) : null"
            :rows="8"
            @retry="refresh"
        >
            <form class="cp-stack" method="post" novalidate @submit.prevent="save">
                <CpSheet
                    v-for="group in groups"
                    :key="group.id"
                    :title="group.title"
                    :description="group.description"
                >
                    <div class="config-grid">
                        <div v-if="group.callback" class="config-field config-field--wide">
                            <span class="config-field__label">{{
                                t('admin.config.callbackUrl')
                            }}</span>
                            <CpCode :value="group.callback" />
                            <p class="cp-help">{{ t('admin.config.callbackHint') }}</p>
                        </div>
                        <div
                            v-for="field in group.fields"
                            :key="field.key"
                            class="config-field"
                            :class="{ 'config-field--wide': field.kind === 'switch' }"
                        >
                            <template v-if="field.kind === 'switch'">
                                <div class="config-field__switch">
                                    <div>
                                        <span
                                            :id="`cfg-${field.key}`"
                                            class="config-field__label"
                                            >{{ field.label }}</span
                                        >
                                        <p v-if="field.hint" class="cp-help">{{ field.hint }}</p>
                                    </div>
                                    <el-switch
                                        :model-value="
                                            values[field.key as PublicConfigKey] === 'true'
                                        "
                                        :aria-labelledby="`cfg-${field.key}`"
                                        :disabled="saving"
                                        @update:model-value="
                                            value =>
                                                (values[field.key as PublicConfigKey] = value
                                                    ? 'true'
                                                    : 'false')
                                        "
                                    />
                                </div>
                            </template>
                            <template v-else-if="field.kind === 'secret'">
                                <label class="config-field__label" :for="`cfg-${field.key}`">
                                    {{ field.label }}
                                    <CpStatus
                                        :tone="
                                            secretState(field.key as SecretConfigKey)
                                                ? 'success'
                                                : 'warning'
                                        "
                                        :label="
                                            secretState(field.key as SecretConfigKey)
                                                ? t('admin.config.configured')
                                                : t('admin.config.notConfigured')
                                        "
                                    />
                                </label>
                                <div class="config-field__secret">
                                    <el-input
                                        :id="`cfg-${field.key}`"
                                        v-model="secrets[field.key as SecretConfigKey]"
                                        type="password"
                                        autocomplete="new-password"
                                        show-password
                                        :placeholder="
                                            clears.has(field.key as SecretConfigKey)
                                                ? t('admin.config.willClear')
                                                : t('admin.config.keepSecret')
                                        "
                                        :disabled="
                                            saving || clears.has(field.key as SecretConfigKey)
                                        "
                                    />
                                    <el-button
                                        v-if="
                                            config?.secrets[field.key as SecretConfigKey]
                                                ?.configured
                                        "
                                        :type="
                                            clears.has(field.key as SecretConfigKey)
                                                ? 'primary'
                                                : 'default'
                                        "
                                        plain
                                        :disabled="saving"
                                        @click="toggleClear(field.key as SecretConfigKey)"
                                    >
                                        {{
                                            clears.has(field.key as SecretConfigKey)
                                                ? t('admin.config.undoClear')
                                                : t('admin.config.clear')
                                        }}
                                    </el-button>
                                </div>
                            </template>
                            <template v-else>
                                <label class="config-field__label" :for="`cfg-${field.key}`">{{
                                    field.label
                                }}</label>
                                <el-input
                                    :id="`cfg-${field.key}`"
                                    v-model="values[field.key as PublicConfigKey]"
                                    :inputmode="field.kind === 'number' ? 'numeric' : undefined"
                                    :class="{ 'cp-mono': field.mono }"
                                    :disabled="saving"
                                />
                                <p v-if="field.hint" class="cp-help">{{ field.hint }}</p>
                            </template>
                            <p v-if="fieldError(field.key)" class="config-field__error">
                                {{ fieldError(field.key) }}
                            </p>
                        </div>
                    </div>
                </CpSheet>

                <div class="config-actions">
                    <CpNote v-if="saveError" tone="danger">{{ saveError }}</CpNote>
                    <span v-else-if="dirty" class="cp-help">{{ t('admin.config.unsaved') }}</span>
                    <el-button :disabled="!dirty || saving" @click="reset">{{
                        t('common.actions.cancel')
                    }}</el-button>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="saving"
                        :disabled="!dirty"
                    >
                        {{ t('common.actions.saveChanges') }}
                    </el-button>
                </div>
            </form>
        </CpDataState>
    </div>
</template>

<script setup lang="ts">
import type {
    AdminConfigPatch,
    AdminConfigResponse,
    PublicConfigKey,
    SecretConfigKey
} from '~/types/config';

type FieldKind = 'text' | 'number' | 'switch' | 'secret';
interface Field {
    key: PublicConfigKey | SecretConfigKey;
    label: string;
    kind: FieldKind;
    hint?: string;
    mono?: boolean;
}

definePageMeta({ middleware: 'admin' });

const { t } = useI18n();
const api = useApi();
const { describe, read } = useApiError();
const publicConfig = usePublicConfig();
const origin = useRequestURL().origin;

useHead({ title: t('common.nav.adminConfig') });

const {
    data: config,
    pending,
    error,
    refresh
} = await useAsyncData('admin-config', () => api<AdminConfigResponse>('/api/admin/config'));

const values = reactive({} as Record<PublicConfigKey, string>);
const secrets = reactive({} as Record<SecretConfigKey, string>);
const clears = ref(new Set<SecretConfigKey>());
const fieldErrors = ref<Record<string, string>>({});
const saveError = ref('');
const saving = ref(false);

function reset() {
    if (!config.value) return;
    Object.assign(values, config.value.values);
    for (const key of Object.keys(config.value.secrets) as SecretConfigKey[]) secrets[key] = '';
    clears.value = new Set();
    fieldErrors.value = {};
    saveError.value = '';
}
watch(config, reset, { immediate: true });

function secretState(key: SecretConfigKey): boolean {
    return Boolean(config.value?.secrets[key]?.configured) && !clears.value.has(key);
}

function toggleClear(key: SecretConfigKey) {
    const next = new Set(clears.value);
    if (next.has(key)) next.delete(key);
    else {
        next.add(key);
        secrets[key] = '';
    }
    clears.value = next;
}

function fieldError(key: string): string {
    return fieldErrors.value[`values.${key}`] ?? fieldErrors.value[`secrets.${key}`] ?? '';
}

const provider = (id: 'codeforces' | 'github' | 'google' | 'clist', name: string) => ({
    id,
    title: name,
    description: t('admin.config.providerText', { name }),
    callback: `${origin}/oauth/thirdparty/${id}`,
    fields: [
        {
            key: `${id}_client_id`,
            label: t('admin.config.fields.clientId'),
            kind: 'text',
            mono: true
        },
        { key: `${id}_client_secret`, label: t('admin.config.fields.clientSecret'), kind: 'secret' }
    ] as Field[]
});

const groups = computed(() => [
    {
        id: 'site',
        title: t('admin.config.groups.site'),
        description: t('admin.config.groups.siteText'),
        callback: '',
        fields: [
            { key: 'site_title', label: t('admin.config.fields.siteTitle'), kind: 'text' },
            {
                key: 'registration_enabled',
                label: t('admin.config.fields.registration'),
                kind: 'switch',
                hint: t('admin.config.fields.registrationHint')
            },
            {
                key: 'home_recent_users_count',
                label: t('admin.config.fields.recentUsers'),
                kind: 'number',
                hint: t('admin.config.fields.recentUsersHint')
            },
            {
                key: 'username_refresh_cooldown',
                label: t('admin.config.fields.refreshCooldown'),
                kind: 'number',
                hint: t('admin.config.fields.refreshCooldownHint')
            }
        ] as Field[]
    },
    {
        id: 'smtp',
        title: t('admin.config.groups.smtp'),
        description: t('admin.config.groups.smtpText'),
        callback: '',
        fields: [
            {
                key: 'smtp_host',
                label: t('admin.config.fields.smtpHost'),
                kind: 'text',
                mono: true
            },
            { key: 'smtp_port', label: t('admin.config.fields.smtpPort'), kind: 'number' },
            {
                key: 'smtp_user',
                label: t('admin.config.fields.smtpUser'),
                kind: 'text',
                mono: true
            },
            { key: 'smtp_pass', label: t('admin.config.fields.smtpPass'), kind: 'secret' },
            {
                key: 'smtp_from',
                label: t('admin.config.fields.smtpFrom'),
                kind: 'text',
                hint: t('admin.config.fields.smtpFromHint')
            }
        ] as Field[]
    },
    {
        id: 'turnstile',
        title: t('admin.config.groups.turnstile'),
        description: t('admin.config.groups.turnstileText'),
        callback: '',
        fields: [
            {
                key: 'turnstile_enabled',
                label: t('admin.config.fields.turnstileEnabled'),
                kind: 'switch',
                hint: t('admin.config.fields.turnstileHint')
            },
            {
                key: 'turnstile_site_key',
                label: t('admin.config.fields.siteKey'),
                kind: 'text',
                mono: true
            },
            {
                key: 'turnstile_secret_key',
                label: t('admin.config.fields.secretKey'),
                kind: 'secret'
            }
        ] as Field[]
    },
    provider('codeforces', 'Codeforces'),
    provider('github', 'GitHub'),
    provider('google', 'Google'),
    provider('clist', 'Clist.by')
]);

const patch = computed<AdminConfigPatch>(() => {
    const body: AdminConfigPatch = {};
    if (!config.value) return body;
    const changed = (Object.keys(values) as PublicConfigKey[]).filter(
        key => values[key] !== config.value!.values[key]
    );
    if (changed.length)
        body.values = Object.fromEntries(changed.map(key => [key, values[key].trim()]));
    const newSecrets = (Object.keys(secrets) as SecretConfigKey[]).filter(
        key => secrets[key] && !clears.value.has(key)
    );
    if (newSecrets.length)
        body.secrets = Object.fromEntries(newSecrets.map(key => [key, secrets[key]]));
    if (clears.value.size) body.clearSecrets = [...clears.value];
    return body;
});
const dirty = computed(() => Object.keys(patch.value).length > 0);

async function save() {
    if (!dirty.value) return;
    saving.value = true;
    saveError.value = '';
    fieldErrors.value = {};
    try {
        config.value = await api<AdminConfigResponse>('/api/admin/config', {
            method: 'PATCH',
            body: patch.value
        });
        await publicConfig.refresh();
        ElMessage.success(t('common.states.saved'));
    } catch (cause) {
        const info = read(cause);
        fieldErrors.value = info.fields;
        if (!Object.keys(info.fields).length) saveError.value = describe(cause);
        else saveError.value = t('admin.config.fixFields');
    } finally {
        saving.value = false;
    }
}
</script>

<style scoped lang="scss">
.config-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cp-space-4) var(--cp-space-5);
}

.config-field {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-1);
    min-width: 0;
}

.config-field--wide {
    grid-column: 1 / -1;
}

.config-field__label {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cp-space-2);
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text);
}

.config-field__switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cp-space-4);
}

.config-field__secret {
    display: flex;
    gap: var(--cp-space-2);

    .el-button {
        flex: none;
    }
}

.config-field__error {
    font-size: var(--cp-text-sm);
    color: var(--cp-danger);
}

.config-actions {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--cp-space-2) var(--cp-space-3);
    padding: var(--cp-space-3) 0;
    background: var(--cp-canvas);
    border-top: 1px solid var(--cp-line);

    .el-button + .el-button {
        margin-left: 0;
    }

    .cp-note {
        flex: 1;
    }
}

@media (max-width: 767px) {
    .config-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
