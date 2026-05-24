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
                <el-form-item :label="$t('developer.redirect_uris')" prop="redirectUris">
                    <el-input
                        v-model="newApp.redirectUris"
                        :placeholder="$t('developer.redirect_uris_hint')"
                    />
                </el-form-item>
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
                :rules="editRules"
                label-position="top"
                @submit.prevent="handleUpdate"
            >
                <el-form-item :label="$t('developer.app_name')" prop="name">
                    <el-input v-model="editForm.name" />
                </el-form-item>
                <el-form-item :label="$t('developer.redirect_uris')" prop="redirectUris">
                    <el-input
                        v-model="editForm.redirectUris"
                        :placeholder="$t('developer.redirect_uris_hint')"
                    />
                </el-form-item>
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
                    <p class="developer__client-uris">{{ client.redirectUris.join(', ') }}</p>
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
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
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

const clients = ref<OAuthClient[]>([]);
const creating = ref(false);
const updating = ref(false);
const newSecret = ref<{ clientId: string; clientSecret: string } | null>(null);
const secretVisible = ref(false);
const editVisible = ref(false);
const editingId = ref('');

const newApp = reactive({
    name: '',
    redirectUris: '',
    requireEmailVerified: false
});

const editForm = reactive({
    name: '',
    redirectUris: '',
    requireEmailVerified: false
});

const rules = computed<FormRules>(() => ({
    name: [{ required: true, message: t('developer.app_name'), trigger: 'blur' }],
    redirectUris: [{ required: true, message: t('developer.redirect_uris'), trigger: 'blur' }]
}));

const editRules = computed<FormRules>(() => ({
    name: [{ required: true, message: t('developer.app_name'), trigger: 'blur' }],
    redirectUris: [{ required: true, message: t('developer.redirect_uris'), trigger: 'blur' }]
}));

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
        const uris = newApp.redirectUris
            .split(',')
            .map(u => u.trim())
            .filter(Boolean);
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
        newApp.redirectUris = '';
        newApp.requireEmailVerified = false;
        formRef.value.resetFields();
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
    editForm.redirectUris = client.redirectUris.join(', ');
    editForm.requireEmailVerified = client.requireEmailVerified;
    editVisible.value = true;
}

function resetEditForm() {
    editingId.value = '';
    editForm.name = '';
    editForm.redirectUris = '';
    editForm.requireEmailVerified = false;
    editFormRef.value?.resetFields();
}

async function handleUpdate() {
    if (!editFormRef.value) return;
    const valid = await editFormRef.value.validate().catch(() => false);
    if (!valid) return;

    updating.value = true;
    try {
        const uris = editForm.redirectUris
            .split(',')
            .map(u => u.trim())
            .filter(Boolean);
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

    &__client-uris {
        font-size: 12px;
        color: var(--text-secondary);
        margin-top: 2px;
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
}
</style>
