<template>
    <div class="admin-notices">
        <h1 class="admin-notices__title">{{ $t('admin.title') }}</h1>
        <el-tabs v-model="activeTab" @tab-change="handleTabChange">
            <el-tab-pane :label="$t('admin.users.tab')" name="users" />
            <el-tab-pane :label="$t('admin.notices.tab')" name="notices" />
            <el-tab-pane :label="$t('admin.showcase.tab')" name="showcase" />
            <el-tab-pane :label="$t('admin.config.tab')" name="config" />
        </el-tabs>

        <el-card shadow="never" class="admin-notices__create-card">
            <template #header>
                <span>{{ $t('admin.notices.create_title') }}</span>
            </template>

            <el-form label-position="top" @submit.prevent="handleCreate">
                <el-form-item :label="$t('admin.notices.notice_title')">
                    <el-input v-model="form.title" :maxlength="120" show-word-limit />
                </el-form-item>

                <el-form-item :label="$t('admin.notices.notice_content')">
                    <el-input
                        v-model="form.content"
                        type="textarea"
                        :autosize="{ minRows: 4, maxRows: 10 }"
                    />
                </el-form-item>

                <el-form-item>
                    <el-checkbox v-model="form.pinned">
                        {{ $t('admin.notices.pinned') }}
                    </el-checkbox>
                </el-form-item>

                <el-form-item>
                    <el-button type="primary" native-type="submit" :loading="creating">
                        {{ creating ? $t('admin.notices.creating') : $t('admin.notices.create') }}
                    </el-button>
                </el-form-item>
            </el-form>
        </el-card>

        <el-card shadow="never" class="admin-notices__list-card">
            <template #header>
                <span>{{ $t('admin.notices.list_title') }}</span>
            </template>

            <div v-loading="loading">
                <div v-if="notices.length" class="admin-notices__list">
                    <article v-for="n in notices" :key="n.id" class="admin-notices__item">
                        <header class="admin-notices__item-header">
                            <div class="admin-notices__meta">
                                <h3 class="admin-notices__item-title">{{ n.title }}</h3>
                                <el-tag v-if="n.pinned" size="small" type="warning">
                                    {{ $t('admin.notices.pinned') }}
                                </el-tag>
                            </div>
                            <el-popconfirm
                                :title="$t('admin.notices.delete_confirm')"
                                @confirm="deleteNotice(n.id)"
                            >
                                <template #reference>
                                    <el-button type="danger" text size="small">
                                        {{ $t('admin.notices.delete') }}
                                    </el-button>
                                </template>
                            </el-popconfirm>
                        </header>
                        <p class="admin-notices__content">{{ n.content }}</p>
                        <p class="admin-notices__time">{{ formatTime(n.publishedAt) }}</p>
                    </article>
                </div>
                <el-empty v-else :description="$t('admin.notices.empty')" />
            </div>
        </el-card>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';

const { t } = useI18n();

useHead({ title: () => `${t('admin.notices.tab')} - CP OAuth` });

const token = useCookie('auth_token');
const activeTab = ref('notices');
const loading = ref(false);
const creating = ref(false);

interface AdminNotice {
    id: string;
    title: string;
    content: string;
    pinned: boolean;
    publishedAt: string;
}

const notices = ref<AdminNotice[]>([]);
const form = reactive({
    title: '',
    content: '',
    pinned: false
});

function handleTabChange(name: string | number) {
    if (name === 'users') {
        navigateTo('/admin');
    }
    if (name === 'showcase') {
        navigateTo('/admin/showcase');
    }
    if (name === 'config') {
        navigateTo('/admin/config');
    }
}

function formatTime(raw: string): string {
    const date = new Date(raw);
    return date.toLocaleString();
}

async function loadNotices() {
    loading.value = true;
    try {
        const data = await $fetch<{ notices: AdminNotice[] }>('/api/admin/notices', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
        notices.value = data.notices;
    } catch {
        navigateTo('/');
    } finally {
        loading.value = false;
    }
}

async function handleCreate() {
    creating.value = true;
    try {
        await $fetch('/api/admin/notices', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: {
                title: form.title,
                content: form.content,
                pinned: form.pinned
            }
        });

        form.title = '';
        form.content = '';
        form.pinned = false;

        ElMessage.success(t('admin.notices.created'));
        await loadNotices();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('admin.error'));
    } finally {
        creating.value = false;
    }
}

async function deleteNotice(id: string) {
    try {
        await $fetch(`/api/admin/notices/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        ElMessage.success(t('admin.notices.deleted'));
        await loadNotices();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('admin.error'));
    }
}

await loadNotices();
</script>

<style scoped lang="scss">
.admin-notices {
    max-width: 760px;

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 16px;
        color: var(--text-primary);
    }

    &__create-card,
    &__list-card {
        margin-top: 14px;
        border: 1px solid var(--border-color);
    }

    &__list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    &__item {
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        border-radius: 8px;
        padding: 12px;
    }

    &__item-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
    }

    &__meta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }

    &__item-title {
        margin: 0;
        font-size: 15px;
        color: var(--text-primary);
    }

    &__content {
        margin: 8px 0 6px;
        white-space: pre-wrap;
        color: var(--text-secondary);
        line-height: 1.65;
    }

    &__time {
        margin: 0;
        font-size: 12px;
        color: var(--text-muted);
    }
}
</style>
