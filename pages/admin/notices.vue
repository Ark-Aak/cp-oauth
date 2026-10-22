<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.admin')"
            :title="t('common.nav.adminNotices')"
            :description="t('admin.notices.description')"
        />

        <div class="cp-stack">
            <CpSheet
                :title="t('admin.notices.createTitle')"
                :description="t('admin.notices.createText')"
            >
                <form class="notice-form" method="post" novalidate @submit.prevent="create">
                    <div class="notice-form__field">
                        <label :for="ids.title">{{ t('admin.notices.fields.title') }}</label>
                        <el-input
                            :id="ids.title"
                            v-model="form.title"
                            maxlength="120"
                            show-word-limit
                            :disabled="busy"
                        />
                        <p v-if="fieldErrors.title" class="notice-form__error">
                            {{ fieldErrors.title }}
                        </p>
                    </div>
                    <div class="notice-form__field">
                        <label :for="ids.content">{{ t('admin.notices.fields.content') }}</label>
                        <el-input
                            :id="ids.content"
                            v-model="form.content"
                            type="textarea"
                            class="notice-form__content"
                            :autosize="{ minRows: 6, maxRows: 20 }"
                            :disabled="busy"
                        />
                        <p v-if="fieldErrors.content" class="notice-form__error">
                            {{ fieldErrors.content }}
                        </p>
                        <p v-else class="cp-help">{{ t('admin.notices.allowedTags') }}</p>
                    </div>
                    <div class="notice-form__row">
                        <el-checkbox v-model="form.pinned" :disabled="busy">{{
                            t('admin.notices.fields.pinned')
                        }}</el-checkbox>
                        <div class="notice-form__actions">
                            <CpNote v-if="createError" tone="danger">{{ createError }}</CpNote>
                            <el-button
                                type="primary"
                                native-type="submit"
                                :loading="busy"
                                :disabled="!form.title.trim() || !form.content.trim()"
                            >
                                {{ t('admin.notices.publish') }}
                            </el-button>
                        </div>
                    </div>
                </form>
            </CpSheet>

            <CpSheet
                :title="t('admin.notices.listTitle')"
                :description="t('admin.notices.listText')"
                flush
            >
                <CpDataState
                    :pending="pending"
                    :error="error ? describe(error) : null"
                    :empty="!data?.notices.length"
                    :empty-text="t('admin.notices.empty')"
                    @retry="refresh"
                >
                    <ul class="notice-list">
                        <li
                            v-for="notice in data?.notices"
                            :key="notice.id"
                            class="notice-list__item"
                        >
                            <div class="notice-list__head">
                                <h3 class="notice-list__title">{{ notice.title }}</h3>
                                <CpStatus
                                    v-if="notice.pinned"
                                    tone="accent"
                                    :label="t('admin.notices.pinned')"
                                />
                                <time class="cp-help" :datetime="notice.publishedAt">{{
                                    dateTime(notice.publishedAt)
                                }}</time>
                                <el-button
                                    class="notice-list__delete"
                                    type="danger"
                                    plain
                                    size="small"
                                    :loading="deleting === notice.id"
                                    @click="remove(notice)"
                                >
                                    {{ t('common.actions.delete') }}
                                </el-button>
                            </div>
                            <!-- eslint-disable-next-line vue/no-v-html -- sanitized by the server allow-list -->
                            <div class="cp-prose notice-list__body" v-html="notice.content" />
                        </li>
                    </ul>
                </CpDataState>
            </CpSheet>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { NoticeSummary } from '~/types/api';

definePageMeta({ middleware: 'admin' });

const { t } = useI18n();
const api = useApi();
const { describe, read } = useApiError();
const { dateTime } = useFormat();

useHead({ title: t('common.nav.adminNotices') });

const ids = { title: useId(), content: useId() };

const { data, pending, error, refresh } = await useAsyncData('admin-notices', () =>
    api<{ notices: NoticeSummary[] }>('/api/admin/notices')
);

const form = reactive({ title: '', content: '', pinned: false });
const busy = ref(false);
const createError = ref('');
const fieldErrors = ref<Record<string, string>>({});

async function create() {
    busy.value = true;
    createError.value = '';
    fieldErrors.value = {};
    try {
        await api('/api/admin/notices', {
            method: 'POST',
            body: { title: form.title.trim(), content: form.content, pinned: form.pinned }
        });
        form.title = '';
        form.content = '';
        form.pinned = false;
        await refresh();
        ElMessage.success(t('admin.notices.published'));
    } catch (cause) {
        const info = read(cause);
        fieldErrors.value = info.fields;
        if (!Object.keys(info.fields).length) createError.value = describe(cause);
    } finally {
        busy.value = false;
    }
}

const deleting = ref<string | null>(null);

async function remove(notice: NoticeSummary) {
    try {
        await ElMessageBox.confirm(
            t('admin.notices.deleteConfirm', { title: notice.title }),
            t('admin.notices.deleteTitle'),
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
    deleting.value = notice.id;
    try {
        await api(`/api/admin/notices/${encodeURIComponent(notice.id)}`, { method: 'DELETE' });
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
.notice-form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.notice-form__field {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-1);

    label {
        font-size: var(--cp-text-sm);
        font-weight: var(--cp-weight-medium);
        color: var(--cp-text);
    }
}

.notice-form__content :deep(textarea) {
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-sm);
}

.notice-form__error {
    font-size: var(--cp-text-sm);
    color: var(--cp-danger);
}

.notice-form__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--cp-space-3);
}

.notice-form__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cp-space-3);
}

.notice-list__item {
    padding: var(--cp-space-4) var(--cp-space-5);
    border-bottom: 1px solid var(--cp-line);

    &:last-child {
        border-bottom: 0;
    }
}

.notice-list__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cp-space-2) var(--cp-space-3);
}

.notice-list__title {
    font-size: var(--cp-text-md);
    font-weight: var(--cp-weight-strong);
    color: var(--cp-text);
}

.notice-list__delete {
    margin-left: auto;
}

.notice-list__body {
    margin-top: var(--cp-space-2);
}
</style>
