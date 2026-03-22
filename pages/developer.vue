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
            width="480px"
        >
            <el-descriptions :column="1" border>
                <el-descriptions-item label="Client ID">
                    <code>{{ newSecret?.clientId }}</code>
                </el-descriptions-item>
                <el-descriptions-item label="Client Secret">
                    <code>{{ newSecret?.clientSecret }}</code>
                </el-descriptions-item>
            </el-descriptions>
            <template #footer>
                <el-button type="primary" @click="secretVisible = false">
                    {{ $t('developer.dismiss') }}
                </el-button>
            </template>
        </el-dialog>

        <!-- Client list -->
        <el-card shadow="never" class="developer__card">
            <template #header>
                <span class="developer__section-title">{{ $t('developer.your_apps') }}</span>
            </template>
            <el-empty
                v-if="clients.length === 0"
                :description="$t('developer.no_apps')"
                :image-size="60"
            />
            <div v-for="client in clients" :key="client.id" class="developer__client">
                <div class="developer__client-info">
                    <p class="developer__client-name">{{ client.name }}</p>
                    <p class="developer__client-id">{{ client.clientId }}</p>
                    <p class="developer__client-uris">{{ client.redirectUris.join(', ') }}</p>
                </div>
                <el-button type="danger" plain size="small" @click="handleDelete(client.id)">
                    {{ $t('developer.delete') }}
                </el-button>
            </div>
        </el-card>
    </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';

const { t } = useI18n();
const token = useCookie('auth_token');
const formRef = ref<FormInstance>();

interface OAuthClient {
    id: string;
    clientId: string;
    name: string;
    redirectUris: string[];
    createdAt: string;
}

const clients = ref<OAuthClient[]>([]);
const creating = ref(false);
const newSecret = ref<{ clientId: string; clientSecret: string } | null>(null);
const secretVisible = ref(false);

const newApp = reactive({
    name: '',
    redirectUris: ''
});

const rules = computed<FormRules>(() => ({
    name: [{ required: true, message: t('developer.app_name'), trigger: 'blur' }],
    redirectUris: [{ required: true, message: t('developer.redirect_uris'), trigger: 'blur' }]
}));

async function loadClients() {
    try {
        clients.value = await $fetch<OAuthClient[]>('/api/oauth/clients', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
    } catch {
        navigateTo('/login');
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
            body: { name: newApp.name, redirectUris: uris }
        });
        newSecret.value = { clientId: result.clientId, clientSecret: result.clientSecret };
        secretVisible.value = true;
        newApp.name = '';
        newApp.redirectUris = '';
        formRef.value.resetFields();
        await loadClients();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('developer.create_error'));
    } finally {
        creating.value = false;
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
    max-width: 600px;

    &__title {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 4px;
        color: var(--text-primary);
    }

    &__subtitle {
        font-size: 14px;
        color: var(--text-secondary);
        margin-bottom: 32px;
    }

    &__section-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
    }

    &__card {
        margin-bottom: 24px;
        border: 1px solid var(--border-color);

        code {
            font-family: monospace;
            font-size: 13px;
            word-break: break-all;
        }
    }

    &__client {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 0;
        border-bottom: 1px solid var(--border-color);

        &:last-child {
            border-bottom: none;
        }
    }

    &__client-name {
        font-size: 14px;
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
}
</style>
