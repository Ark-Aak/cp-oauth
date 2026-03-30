<template>
    <div class="admin-showcase">
        <h1 class="admin-showcase__title">{{ $t('admin.title') }}</h1>
        <el-tabs v-model="activeTab" @tab-change="handleTabChange">
            <el-tab-pane :label="$t('admin.users.tab')" name="users" />
            <el-tab-pane :label="$t('admin.notices.tab')" name="notices" />
            <el-tab-pane :label="$t('admin.showcase.tab')" name="showcase" />
            <el-tab-pane :label="$t('admin.config.tab')" name="config" />
        </el-tabs>

        <el-card shadow="never" class="admin-showcase__card">
            <template #header>
                <span>{{ $t('admin.showcase.create_title') }}</span>
            </template>

            <el-form label-position="top" @submit.prevent="handleCreate">
                <el-form-item :label="$t('admin.showcase.category')">
                    <el-select v-model="form.category">
                        <el-option value="site" :label="$t('admin.showcase.category_site')" />
                        <el-option value="project" :label="$t('admin.showcase.category_project')" />
                    </el-select>
                </el-form-item>

                <el-form-item :label="$t('admin.showcase.name')">
                    <el-input v-model="form.name" />
                </el-form-item>

                <el-form-item :label="$t('admin.showcase.url')">
                    <el-input v-model="form.url" placeholder="https://..." />
                </el-form-item>

                <el-form-item :label="$t('admin.showcase.description')">
                    <el-input
                        v-model="form.description"
                        type="textarea"
                        :autosize="{ minRows: 2, maxRows: 6 }"
                    />
                </el-form-item>

                <el-form-item :label="$t('admin.showcase.icon_url')">
                    <el-input
                        v-model="form.iconUrl"
                        :placeholder="$t('admin.showcase.icon_url_hint')"
                    />
                </el-form-item>

                <el-form-item :label="$t('admin.showcase.sort_order')">
                    <el-input-number v-model="form.sortOrder" :min="0" controls-position="right" />
                </el-form-item>

                <el-form-item>
                    <el-button type="primary" native-type="submit" :loading="creating">
                        {{ creating ? $t('admin.showcase.creating') : $t('admin.showcase.create') }}
                    </el-button>
                </el-form-item>
            </el-form>
        </el-card>

        <el-card shadow="never" class="admin-showcase__card">
            <template #header>
                <span>{{ $t('admin.showcase.list_title') }}</span>
            </template>

            <div v-loading="loading">
                <div v-if="items.length" class="admin-showcase__list">
                    <div v-for="item in items" :key="item.id" class="admin-showcase__item">
                        <div class="admin-showcase__item-info">
                            <div class="admin-showcase__item-header">
                                <el-tag
                                    size="small"
                                    :type="item.category === 'site' ? '' : 'success'"
                                >
                                    {{
                                        item.category === 'site'
                                            ? $t('admin.showcase.category_site')
                                            : $t('admin.showcase.category_project')
                                    }}
                                </el-tag>
                                <span class="admin-showcase__item-name">{{ item.name }}</span>
                                <span class="admin-showcase__item-order"
                                    >#{{ item.sortOrder }}</span
                                >
                            </div>
                            <p class="admin-showcase__item-url">{{ item.url }}</p>
                            <p v-if="item.description" class="admin-showcase__item-desc">
                                {{ item.description }}
                            </p>
                        </div>
                        <el-popconfirm
                            :title="$t('admin.showcase.delete_confirm')"
                            @confirm="handleDelete(item.id)"
                        >
                            <template #reference>
                                <el-button type="danger" text size="small">
                                    {{ $t('admin.showcase.delete') }}
                                </el-button>
                            </template>
                        </el-popconfirm>
                    </div>
                </div>
                <el-empty v-else :description="$t('admin.showcase.empty')" />
            </div>
        </el-card>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';

const { t } = useI18n();

useHead({ title: () => `${t('admin.showcase.tab')} - CP OAuth` });

const token = useCookie('auth_token');
const activeTab = ref('showcase');
const loading = ref(false);
const creating = ref(false);

interface ShowcaseItem {
    id: string;
    category: string;
    name: string;
    description: string;
    url: string;
    iconUrl: string | null;
    sortOrder: number;
}

const items = ref<ShowcaseItem[]>([]);
const form = reactive({
    category: 'site',
    name: '',
    description: '',
    url: '',
    iconUrl: '',
    sortOrder: 0
});

function handleTabChange(name: string | number) {
    if (name === 'users') navigateTo('/admin');
    if (name === 'notices') navigateTo('/admin/notices');
    if (name === 'config') navigateTo('/admin/config');
}

async function loadItems() {
    loading.value = true;
    try {
        const data = await $fetch<{ items: ShowcaseItem[] }>('/api/admin/showcase', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
        items.value = data.items;
    } catch {
        navigateTo('/');
    } finally {
        loading.value = false;
    }
}

async function handleCreate() {
    creating.value = true;
    try {
        await $fetch('/api/admin/showcase', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: {
                category: form.category,
                name: form.name,
                description: form.description,
                url: form.url,
                iconUrl: form.iconUrl || null,
                sortOrder: form.sortOrder
            }
        });

        form.name = '';
        form.description = '';
        form.url = '';
        form.iconUrl = '';
        form.sortOrder = 0;

        ElMessage.success(t('admin.showcase.created'));
        await loadItems();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('admin.error'));
    } finally {
        creating.value = false;
    }
}

async function handleDelete(id: string) {
    try {
        await $fetch(`/api/admin/showcase/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        ElMessage.success(t('admin.showcase.deleted'));
        await loadItems();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('admin.error'));
    }
}

await loadItems();
</script>

<style scoped lang="scss">
.admin-showcase {
    max-width: 760px;

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 16px;
        color: var(--text-primary);
    }

    &__card {
        margin-top: 14px;
        border: 1px solid var(--border-color);
    }

    &__list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    &__item {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        border: 1px solid var(--border-color);
        background: var(--bg-secondary);
        border-radius: 8px;
        padding: 12px;
    }

    &__item-info {
        min-width: 0;
        flex: 1;
    }

    &__item-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__item-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
    }

    &__item-order {
        font-size: 11px;
        color: var(--text-muted);
    }

    &__item-url {
        font-size: 12px;
        color: var(--text-muted);
        font-family: monospace;
        margin: 4px 0 0;
        word-break: break-all;
    }

    &__item-desc {
        font-size: 12px;
        color: var(--text-secondary);
        margin: 4px 0 0;
    }
}
</style>
