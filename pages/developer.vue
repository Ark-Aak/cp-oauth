<template>
    <div class="developer">
        <h1 class="developer__title">{{ $t('developer.title') }}</h1>
        <p class="developer__subtitle">{{ $t('developer.subtitle') }}</p>

        <!-- Create new app -->
        <el-card shadow="never" class="developer__card">
            <template #header>
                <span class="developer__section-title">{{ $t('developer.register_app') }}</span>
            </template>
            <el-form
                ref="formRef"
                :model="newApp"
                :rules="rules"
                label-position="top"
                @submit.prevent="handleCreate"
            >
                <el-form-item :label="$t('developer.app_name')" prop="name">
                    <el-input v-model="newApp.name" />
                </el-form-item>
                <div class="developer__redirect-group">
                    <div class="developer__field-label">
                        {{ $t('developer.redirect_uris') }}
                        <span class="developer__required" aria-hidden="true">*</span>
                    </div>
                    <p class="developer__field-hint">
                        {{ $t('developer.redirect_uris_hint') }}
                    </p>
                    <div
                        v-for="(redirectUri, index) in newApp.redirectUris"
                        :key="redirectUri.id"
                        class="developer__redirect-row"
                    >
                        <el-form-item
                            :prop="`redirectUris.${index}.value`"
                            :rules="redirectUriRules"
                            class="developer__redirect-item"
                        >
                            <el-input
                                v-model="redirectUri.value"
                                :aria-label="$t('developer.redirect_uris') + ' ' + (index + 1)"
                                :placeholder="$t('developer.redirect_uri_placeholder')"
                            />
                        </el-form-item>
                        <el-button
                            v-if="newApp.redirectUris.length > 1"
                            class="developer__redirect-remove"
                            circle
                            plain
                            native-type="button"
                            :aria-label="$t('developer.remove_redirect_uri')"
                            @click="removeRedirectUri(newApp.redirectUris, index)"
                        >
                            <Trash2 :size="15" />
                        </el-button>
                    </div>
                    <el-button
                        class="developer__redirect-add"
                        text
                        native-type="button"
                        @click="addRedirectUri(newApp.redirectUris)"
                    >
                        <Plus :size="15" />
                        {{ $t('developer.add_redirect_uri') }}
                    </el-button>
                </div>
                <el-form-item>
                    <el-checkbox v-model="newApp.requireEmailVerified">
                        {{ $t('developer.require_email_verified') }}
                    </el-checkbox>
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" native-type="submit" :loading="creating">
                        {{ creating ? $t('developer.creating') : $t('developer.create') }}
                    </el-button>
                </el-form-item>
            </el-form>
        </el-card>

        <!-- Show secret once -->
        <el-dialog
            v-model="secretVisible"
            :title="$t('developer.secret_warning')"
            :close-on-click-modal="false"
            width="520px"
        >
            <el-descriptions :column="1" border>
                <el-descriptions-item label="Client ID">
                    <code class="developer__secret-code">{{ newSecret?.clientId }}</code>
                </el-descriptions-item>
                <el-descriptions-item label="Client Secret">
                    <code class="developer__secret-code">{{ newSecret?.clientSecret }}</code>
                </el-descriptions-item>
            </el-descriptions>
            <template #footer>
                <el-button type="primary" @click="secretVisible = false">
                    {{ $t('developer.dismiss') }}
                </el-button>
            </template>
        </el-dialog>

        <!-- Edit dialog -->
        <el-dialog
            v-model="editVisible"
            :title="$t('developer.edit_app')"
            width="500px"
            :close-on-click-modal="false"
            @closed="resetEditForm"
        >
            <el-form
                ref="editFormRef"
                :model="editForm"
                :rules="rules"
                label-position="top"
                @submit.prevent="handleUpdate"
            >
                <el-form-item :label="$t('developer.app_name')" prop="name">
                    <el-input v-model="editForm.name" />
                </el-form-item>
                <div class="developer__redirect-group">
                    <div class="developer__field-label">
                        {{ $t('developer.redirect_uris') }}
                        <span class="developer__required" aria-hidden="true">*</span>
                    </div>
                    <p class="developer__field-hint">
                        {{ $t('developer.redirect_uris_hint') }}
                    </p>
                    <div
                        v-for="(redirectUri, index) in editForm.redirectUris"
                        :key="redirectUri.id"
                        class="developer__redirect-row"
                    >
                        <el-form-item
                            :prop="`redirectUris.${index}.value`"
                            :rules="redirectUriRules"
                            class="developer__redirect-item"
                        >
                            <el-input
                                v-model="redirectUri.value"
                                :aria-label="$t('developer.redirect_uris') + ' ' + (index + 1)"
                                :placeholder="$t('developer.redirect_uri_placeholder')"
                            />
                        </el-form-item>
                        <el-button
                            v-if="editForm.redirectUris.length > 1"
                            class="developer__redirect-remove"
                            circle
                            plain
                            native-type="button"
                            :aria-label="$t('developer.remove_redirect_uri')"
                            @click="removeRedirectUri(editForm.redirectUris, index)"
                        >
                            <Trash2 :size="15" />
                        </el-button>
                    </div>
                    <el-button
                        class="developer__redirect-add"
                        text
                        native-type="button"
                        @click="addRedirectUri(editForm.redirectUris)"
                    >
                        <Plus :size="15" />
                        {{ $t('developer.add_redirect_uri') }}
                    </el-button>
                </div>
                <el-form-item>
                    <el-checkbox v-model="editForm.requireEmailVerified">
                        {{ $t('developer.require_email_verified') }}
                    </el-checkbox>
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" native-type="submit" :loading="updating">
                        {{ updating ? $t('developer.saving') : $t('developer.save') }}
                    </el-button>
                    <el-button @click="editVisible = false">{{ $t('developer.cancel') }}</el-button>
                </el-form-item>
            </el-form>
        </el-dialog>

        <!-- Client list -->
        <el-card shadow="never" class="developer__card">
            <template #header>
                <span class="developer__section-title">{{ $t('developer.your_apps') }}</span>
            </template>
            <el-empty
                v-if="clients.length === 0"
                :description="$t('developer.no_apps')"
                :image-size="48"
            />
            <div v-for="client in clients" :key="client.id" class="developer__client">
                <div class="developer__client-info">
                    <p class="developer__client-name">{{ client.name }}</p>
                    <p class="developer__client-id">{{ client.clientId }}</p>
                    <p class="developer__client-meta-label">
                        {{ $t('developer.redirect_uris') }}
                    </p>
                    <div class="developer__client-uris">
                        <code
                            v-for="redirectUri in client.redirectUris"
                            :key="redirectUri"
                            class="developer__client-uri"
                        >
                            {{ redirectUri }}
                        </code>
                    </div>
                    <p v-if="client.requireEmailVerified" class="developer__client-email-required">
                        {{ $t('developer.email_verified_required') }}
                    </p>
                </div>
                <div class="developer__client-actions">
                    <el-button plain size="small" @click="openEdit(client)">
                        {{ $t('developer.edit') }}
                    </el-button>
                    <el-button type="danger" plain size="small" @click="handleDelete(client.id)">
                        {{ $t('developer.delete') }}
                    </el-button>
                </div>
            </div>
        </el-card>
    </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormItemRule, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { Plus, Trash2 } from 'lucide-vue-next';
import { buildLoginPath } from '~/utils/auth-redirect';

const { t } = useI18n();
const route = useRoute();

useHead({ title: () => `${t('developer.title')} - CP OAuth` });
const token = useCookie('auth_token');
const formRef = ref<FormInstance>();
const editFormRef = ref<FormInstance>();

interface OAuthClient {
    id: string;
    clientId: string;
    name: string;
    redirectUris: string[];
    requireEmailVerified: boolean;
    createdAt: string;
}

interface RedirectUriField {
    id: number;
    value: string;
}

interface ApplicationForm {
    name: string;
    redirectUris: RedirectUriField[];
    requireEmailVerified: boolean;
}

let redirectUriFieldSequence = 0;

function createRedirectUriField(value = ''): RedirectUriField {
    return { id: redirectUriFieldSequence++, value };
}

function isValidOAuthRedirectUri(value: string): boolean {
    try {
        const url = new URL(value.trim());
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function addRedirectUri(fields: RedirectUriField[]) {
    fields.push(createRedirectUriField());
}

function removeRedirectUri(fields: RedirectUriField[], index: number) {
    if (fields.length > 1) fields.splice(index, 1);
}

function normalizeRedirectUriFields(fields: RedirectUriField[]): string[] {
    return Array.from(new Set(fields.map(field => field.value.trim())));
}

const clients = ref<OAuthClient[]>([]);
const creating = ref(false);
const updating = ref(false);
const newSecret = ref<{ clientId: string; clientSecret: string } | null>(null);
const secretVisible = ref(false);
const editVisible = ref(false);
const editingId = ref('');

const newApp = reactive<ApplicationForm>({
    name: '',
    redirectUris: [createRedirectUriField()],
    requireEmailVerified: false
});

const editForm = reactive<ApplicationForm>({
    name: '',
    redirectUris: [createRedirectUriField()],
    requireEmailVerified: false
});

const rules = computed<FormRules>(() => ({
    name: [{ required: true, message: t('developer.app_name'), trigger: 'blur' }]
}));

const redirectUriRules = computed<FormItemRule[]>(() => [
    {
        validator: (_rule, value, callback) => {
            if (typeof value !== 'string' || value.trim().length === 0) {
                callback(new Error(t('developer.redirect_uri_required')));
                return;
            }
            if (!isValidOAuthRedirectUri(value)) {
                callback(new Error(t('developer.redirect_uri_invalid')));
                return;
            }
            callback();
        },
        trigger: 'blur'
    }
]);

async function loadClients() {
    try {
        clients.value = await $fetch<OAuthClient[]>('/api/oauth/clients', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
    } catch {
        navigateTo(buildLoginPath(route.fullPath));
    }
}

async function handleCreate() {
    if (!formRef.value) return;
    const valid = await formRef.value.validate().catch(() => false);
    if (!valid) return;

    creating.value = true;
    try {
        const uris = normalizeRedirectUriFields(newApp.redirectUris);
        const result = await $fetch<OAuthClient & { clientSecret: string }>('/api/oauth/clients', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: {
                name: newApp.name,
                redirectUris: uris,
                requireEmailVerified: newApp.requireEmailVerified
            }
        });
        newSecret.value = { clientId: result.clientId, clientSecret: result.clientSecret };
        secretVisible.value = true;
        newApp.name = '';
        newApp.redirectUris = [createRedirectUriField()];
        newApp.requireEmailVerified = false;
        await nextTick();
        formRef.value?.clearValidate();
        await loadClients();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('developer.create_error'));
    } finally {
        creating.value = false;
    }
}

function openEdit(client: OAuthClient) {
    editingId.value = client.id;
    editForm.name = client.name;
    editForm.redirectUris = client.redirectUris.map(createRedirectUriField);
    editForm.requireEmailVerified = client.requireEmailVerified;
    editVisible.value = true;
    nextTick(() => editFormRef.value?.clearValidate());
}

function resetEditForm() {
    editingId.value = '';
    editForm.name = '';
    editForm.redirectUris = [createRedirectUriField()];
    editForm.requireEmailVerified = false;
    editFormRef.value?.clearValidate();
}

async function handleUpdate() {
    if (!editFormRef.value) return;
    const valid = await editFormRef.value.validate().catch(() => false);
    if (!valid) return;

    updating.value = true;
    try {
        const uris = normalizeRedirectUriFields(editForm.redirectUris);
        await $fetch(`/api/oauth/clients/${editingId.value}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: {
                name: editForm.name,
                redirectUris: uris,
                requireEmailVerified: editForm.requireEmailVerified
            }
        });
        editVisible.value = false;
        ElMessage.success(t('developer.updated'));
        await loadClients();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('developer.update_error'));
    } finally {
        updating.value = false;
    }
}

async function handleDelete(id: string) {
    try {
        await $fetch(`/api/oauth/clients/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        await loadClients();
        ElMessage.success('Deleted');
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('developer.delete_error'));
    }
}

await loadClients();
</script>

<style scoped lang="scss">
.developer {
    max-width: 580px;

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 4px;
        color: var(--text-primary);
    }

    &__subtitle {
        font-size: 13px;
        color: var(--text-secondary);
        margin-bottom: 28px;
    }

    &__section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
    }

    &__redirect-group {
        margin-bottom: 18px;
    }

    &__field-label {
        color: var(--text-primary);
        font-size: 14px;
        line-height: 22px;
    }

    &__required {
        color: var(--el-color-danger);
        margin-left: 2px;
    }

    &__field-hint {
        color: var(--text-muted);
        font-size: 12px;
        line-height: 1.5;
        margin: 2px 0 10px;
    }

    &__redirect-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
    }

    &__redirect-item {
        flex: 1;
        min-width: 0;
        margin-bottom: 14px;
    }

    &__redirect-remove {
        flex-shrink: 0;
    }

    &__redirect-add {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding-left: 0;
    }

    &__card {
        margin-bottom: 20px;
        border: 1px solid var(--border-color);

        code {
            font-family: monospace;
            font-size: 13px;
            word-break: break-all;
        }
    }

    &__secret-code {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 12px;
        word-break: break-all;
        overflow-wrap: anywhere;
        display: block;
        max-width: 100%;
        user-select: all;
    }

    &__client {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid var(--border-color);

        &:last-child {
            border-bottom: none;
        }
    }

    &__client-info {
        flex: 1;
        min-width: 0;
    }

    &__client-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary);
    }

    &__client-id {
        font-size: 12px;
        color: var(--text-muted);
        font-family: monospace;
    }

    &__client-meta-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        margin: 8px 0 4px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    &__client-uris {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
    }

    &__client-uri {
        max-width: 100%;
        padding: 3px 7px;
        border-radius: 5px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        overflow-wrap: anywhere;
    }

    &__client-email-required {
        font-size: 12px;
        color: var(--el-color-warning);
        margin-top: 2px;
    }

    &__client-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
        margin-left: 12px;
    }

    @media (max-width: 640px) {
        &__client {
            align-items: flex-start;
            flex-direction: column;
            gap: 12px;
        }

        &__client-actions {
            margin-left: 0;
        }
    }
}
</style>
