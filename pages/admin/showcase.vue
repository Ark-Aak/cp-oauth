<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.admin')"
            :title="t('common.nav.adminShowcase')"
            :description="t('admin.showcase.description')"
        >
            <template #actions>
                <el-button @click="navigateTo('/showcase')">{{
                    t('admin.showcase.viewPublic')
                }}</el-button>
            </template>
        </CpPageHeader>

        <div class="cp-stack">
            <CpSheet :title="t('admin.showcase.createTitle')">
                <form class="entry-form" method="post" novalidate @submit.prevent="create">
                    <div class="entry-form__grid">
                        <div class="entry-form__field">
                            <span :id="ids.category" class="entry-form__label">{{
                                t('admin.showcase.fields.category')
                            }}</span>
                            <el-segmented
                                v-model="form.category"
                                :options="categoryOptions"
                                :aria-labelledby="ids.category"
                                :disabled="busy"
                            />
                        </div>
                        <div class="entry-form__field">
                            <label class="entry-form__label" :for="ids.sortOrder">{{
                                t('admin.showcase.fields.sortOrder')
                            }}</label>
                            <el-input-number
                                :id="ids.sortOrder"
                                v-model="form.sortOrder"
                                :step="1"
                                :step-strictly="true"
                                controls-position="right"
                                :disabled="busy"
                            />
                            <p class="cp-help">{{ t('admin.showcase.sortHint') }}</p>
                        </div>
                        <div class="entry-form__field">
                            <label class="entry-form__label" :for="ids.name">{{
                                t('admin.showcase.fields.name')
                            }}</label>
                            <el-input
                                :id="ids.name"
                                v-model="form.name"
                                maxlength="120"
                                :disabled="busy"
                            />
                            <p v-if="fieldErrors.name" class="entry-form__error">
                                {{ fieldErrors.name }}
                            </p>
                        </div>
                        <div class="entry-form__field">
                            <label class="entry-form__label" :for="ids.url">{{
                                t('admin.showcase.fields.url')
                            }}</label>
                            <el-input
                                :id="ids.url"
                                v-model="form.url"
                                type="url"
                                inputmode="url"
                                spellcheck="false"
                                placeholder="https://"
                                :disabled="busy"
                            />
                            <p v-if="fieldErrors.url" class="entry-form__error">
                                {{ fieldErrors.url }}
                            </p>
                        </div>
                        <div class="entry-form__field entry-form__field--wide">
                            <label class="entry-form__label" :for="ids.iconUrl">{{
                                t('admin.showcase.fields.iconUrl')
                            }}</label>
                            <el-input
                                :id="ids.iconUrl"
                                v-model="form.iconUrl"
                                type="url"
                                inputmode="url"
                                spellcheck="false"
                                placeholder="https://"
                                :disabled="busy"
                            />
                            <p v-if="fieldErrors.iconUrl" class="entry-form__error">
                                {{ fieldErrors.iconUrl }}
                            </p>
                            <p v-else class="cp-help">{{ t('admin.showcase.iconHint') }}</p>
                        </div>
                        <div class="entry-form__field entry-form__field--wide">
                            <label class="entry-form__label" :for="ids.description">{{
                                t('admin.showcase.fields.description')
                            }}</label>
                            <el-input
                                :id="ids.description"
                                v-model="form.description"
                                type="textarea"
                                maxlength="2000"
                                show-word-limit
                                :autosize="{ minRows: 2, maxRows: 6 }"
                                :disabled="busy"
                            />
                        </div>
                    </div>
                    <CpNote v-if="createError" tone="danger">{{ createError }}</CpNote>
                    <div class="entry-form__actions">
                        <el-button
                            type="primary"
                            native-type="submit"
                            :loading="busy"
                            :disabled="!form.name.trim() || !form.url.trim()"
                        >
                            {{ t('admin.showcase.add') }}
                        </el-button>
                    </div>
                </form>
            </CpSheet>

            <CpDataState
                :pending="pending"
                :error="error ? describe(error) : null"
                :rows="4"
                @retry="refresh"
            >
                <div class="cp-stack">
                    <CpSheet
                        v-for="group in groups"
                        :key="group.category"
                        :title="group.title"
                        flush
                    >
                        <ul v-if="group.items.length" class="cp-rows">
                            <li v-for="item in group.items" :key="item.id">
                                <PublicShowcaseIcon :src="item.iconUrl" :name="item.name" />
                                <div class="cp-rows__main">
                                    <span class="cp-rows__title">{{ item.name }}</span>
                                    <span v-if="item.url" class="cp-rows__meta cp-mono">{{
                                        item.url
                                    }}</span>
                                    <span v-if="item.description" class="cp-rows__meta">{{
                                        item.description
                                    }}</span>
                                    <CpStatus
                                        v-if="item.invalidUrls?.length"
                                        tone="warning"
                                        :label="
                                            t('admin.showcase.invalidUrls', {
                                                fields: item.invalidUrls.join(', ')
                                            })
                                        "
                                    />
                                </div>
                                <span class="cp-rows__meta cp-num">{{
                                    t('admin.showcase.order', { n: item.sortOrder })
                                }}</span>
                                <div class="cp-rows__end">
                                    <el-button
                                        type="danger"
                                        plain
                                        size="small"
                                        :loading="deleting === item.id"
                                        @click="remove(item)"
                                    >
                                        {{ t('common.actions.delete') }}
                                    </el-button>
                                </div>
                            </li>
                        </ul>
                        <p v-else class="entry-list__empty">{{ t('admin.showcase.empty') }}</p>
                    </CpSheet>
                </div>
            </CpDataState>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { ShowcaseItem } from '~/types/api';

definePageMeta({ middleware: 'admin' });

const { t } = useI18n();
const api = useApi();
const { describe, read } = useApiError();

useHead({ title: t('common.nav.adminShowcase') });

const ids = {
    category: useId(),
    sortOrder: useId(),
    name: useId(),
    url: useId(),
    iconUrl: useId(),
    description: useId()
};

const { data, pending, error, refresh } = await useAsyncData('admin-showcase', () =>
    api<{ items: ShowcaseItem[] }>('/api/admin/showcase')
);

const categoryOptions = computed(() => [
    { label: t('admin.showcase.categories.site'), value: 'site' },
    { label: t('admin.showcase.categories.project'), value: 'project' }
]);

const groups = computed(() =>
    (['site', 'project'] as const).map(category => ({
        category,
        title: t(`admin.showcase.groups.${category}`),
        items: (data.value?.items ?? []).filter(item => item.category === category)
    }))
);

const blank = () => ({
    category: 'site' as 'site' | 'project',
    name: '',
    url: '',
    iconUrl: '',
    description: '',
    sortOrder: 0
});
const form = reactive(blank());
const busy = ref(false);
const createError = ref('');
const fieldErrors = ref<Record<string, string>>({});

async function create() {
    busy.value = true;
    createError.value = '';
    fieldErrors.value = {};
    try {
        await api('/api/admin/showcase', {
            method: 'POST',
            body: {
                category: form.category,
                name: form.name.trim(),
                url: form.url.trim(),
                iconUrl: form.iconUrl.trim() || null,
                description: form.description.trim(),
                sortOrder: Math.trunc(form.sortOrder ?? 0)
            }
        });
        Object.assign(form, blank());
        await refresh();
        ElMessage.success(t('admin.showcase.added'));
    } catch (cause) {
        const info = read(cause);
        fieldErrors.value = info.fields;
        if (!Object.keys(info.fields).length) createError.value = describe(cause);
    } finally {
        busy.value = false;
    }
}

const deleting = ref<string | null>(null);

async function remove(item: ShowcaseItem) {
    try {
        await ElMessageBox.confirm(
            t('admin.showcase.deleteConfirm', { name: item.name }),
            t('admin.showcase.deleteTitle'),
            {
                type: 'warning',
                confirmButtonText: t('common.actions.delete'),
                cancelButtonText: t('common.actions.cancel'),
                confirmButtonClass: 'el-button--danger'
            }
        );
    } catch {
        return;
    }
    deleting.value = item.id;
    try {
        await api(`/api/admin/showcase/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        await refresh();
        ElMessage.success(t('common.states.deleted'));
    } catch (cause) {
        ElMessage.error(describe(cause));
    } finally {
        deleting.value = null;
    }
}
</script>

<style scoped lang="scss">
.entry-form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.entry-form__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cp-space-4) var(--cp-space-5);
}

.entry-form__field {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--cp-space-1);
    min-width: 0;

    > .el-input,
    > .el-textarea {
        width: 100%;
    }
}

.entry-form__field--wide {
    grid-column: 1 / -1;
}

.entry-form__label {
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text);
}

.entry-form__error {
    font-size: var(--cp-text-sm);
    color: var(--cp-danger);
}

.entry-form__actions {
    display: flex;
    justify-content: flex-end;
}

.entry-list__empty {
    padding: var(--cp-space-4) var(--cp-space-5);
    font-size: var(--cp-text-sm);
    color: var(--cp-text-3);
}

@media (max-width: 767px) {
    .entry-form__grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
