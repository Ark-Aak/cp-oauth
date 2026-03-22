<template>
    <div class="admin">
        <h1 class="admin__title">{{ $t('admin.title') }}</h1>
        <el-tabs v-model="activeTab" @tab-click="handleTabClick">
            <el-tab-pane :label="$t('admin.users.tab')" name="users" />
            <el-tab-pane :label="$t('admin.config.tab')" name="config" />
        </el-tabs>

        <!-- User search -->
        <el-input
            v-model="search"
            :placeholder="$t('admin.users.search')"
            clearable
            class="admin__search"
            @input="debouncedLoad"
        />

        <!-- User table -->
        <el-table v-loading="tableLoading" :data="users" stripe class="admin__table">
            <el-table-column prop="username" :label="$t('admin.users.username')" />
            <el-table-column prop="email" :label="$t('admin.users.email')" />
            <el-table-column :label="$t('admin.users.role')" width="140">
                <template #default="{ row }">
                    <el-select
                        :model-value="row.role"
                        size="small"
                        @change="(val: string) => updateRole(row.id, val)"
                    >
                        <el-option value="user" label="User" />
                        <el-option value="admin" label="Admin" />
                    </el-select>
                </template>
            </el-table-column>
            <el-table-column :label="$t('admin.users.verified')" width="100" align="center">
                <template #default="{ row }">
                    <el-tag v-if="row.emailVerified" type="success" size="small">✓</el-tag>
                    <el-tag v-else type="danger" size="small">✗</el-tag>
                </template>
            </el-table-column>
            <el-table-column :label="$t('admin.users.actions')" width="120">
                <template #default="{ row }">
                    <el-button
                        v-if="!row.emailVerified"
                        text
                        size="small"
                        @click="verifyUser(row.id)"
                    >
                        {{ $t('admin.users.verify') }}
                    </el-button>
                </template>
            </el-table-column>
        </el-table>

        <el-empty
            v-if="!tableLoading && users.length === 0"
            :description="$t('admin.users.no_results')"
        />

        <!-- Pagination -->
        <el-pagination
            v-if="totalPages > 1"
            v-model:current-page="page"
            :page-size="20"
            :total="total"
            layout="prev, pager, next"
            class="admin__pagination"
            @current-change="loadUsers"
        />
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';

const { t } = useI18n();
const token = useCookie('auth_token');
const activeTab = ref('users');

interface AdminUser {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    role: string;
    emailVerified: boolean;
    createdAt: string;
}

const users = ref<AdminUser[]>([]);
const search = ref('');
const page = ref(1);
const total = ref(0);
const tableLoading = ref(false);
const totalPages = computed(() => Math.ceil(total.value / 20) || 1);

function handleTabClick() {
    if (activeTab.value === 'config') {
        navigateTo('/admin/config');
    }
}

let debounceTimer: ReturnType<typeof setTimeout>;
function debouncedLoad() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        page.value = 1;
        loadUsers();
    }, 300);
}

async function loadUsers() {
    tableLoading.value = true;
    try {
        const data = await $fetch<{ users: AdminUser[]; total: number }>('/api/admin/users', {
            headers: { Authorization: `Bearer ${token.value}` },
            params: { search: search.value, page: page.value }
        });
        users.value = data.users;
        total.value = data.total;
    } catch {
        navigateTo('/');
    } finally {
        tableLoading.value = false;
    }
}

async function updateRole(id: string, role: string) {
    try {
        await $fetch(`/api/admin/users/${id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { role }
        });
        ElMessage.success('Updated');
        await loadUsers();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('admin.error'));
    }
}

async function verifyUser(id: string) {
    try {
        await $fetch(`/api/admin/users/${id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { emailVerified: true }
        });
        ElMessage.success('Verified');
        await loadUsers();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('admin.error'));
    }
}

await loadUsers();
</script>

<style scoped lang="scss">
.admin {
    max-width: 900px;

    &__title {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 20px;
        color: var(--text-primary);
    }

    &__search {
        max-width: 320px;
        margin-bottom: 16px;
    }

    &__table {
        width: 100%;
        margin-bottom: 16px;
    }

    &__pagination {
        margin-top: 16px;
        justify-content: center;
    }
}
</style>
