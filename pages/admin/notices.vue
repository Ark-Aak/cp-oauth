<template>
    <div class="admin-notices">
        <AppPageHeader
            :title="$t('admin.notices.tab')"
            :description="$t('admin.workbench.notices_description')"
        >
            <template #actions>
                <el-button type="primary" native-type="button" @click="createOpen = true">
                    {{ $t('admin.notices.create_title') }}
                </el-button>
            </template>
        </AppPageHeader>
        <AdminSectionNav current="notices" />
        <p v-if="sessionExpired" class="admin-notices__help">
            <NuxtLink :to="loginPath">{{ $t('auth.login.submit') }}</NuxtLink>
        </p>

        <section class="admin-notices__results ui-card" aria-labelledby="notice-list-title">
            <h2 id="notice-list-title">{{ $t('admin.notices.list_title') }}</h2>
            <AppAsyncState
                :pending="loading"
                :error="loadError"
                :empty="notices.length === 0"
                :empty-text="$t('admin.notices.empty')"
                :empty-icon="Bell"
                @retry="loadNotices"
            >
                <div class="admin-notices__list">
                    <article
                        v-for="notice in notices"
                        :key="notice.id"
                        class="admin-notices__item"
                        :aria-busy="!!deleting[notice.id]"
                    >
                        <header class="admin-notices__item-header">
                            <div class="admin-notices__meta">
                                <h3>{{ notice.title }}</h3>
                                <span v-if="notice.pinned" class="admin-notices__pin">{{
                                    $t('admin.notices.pinned_status')
                                }}</span>
                            </div>
                            <el-button
                                type="danger"
                                text
                                native-type="button"
                                :loading="!!deleting[notice.id]"
                                :disabled="!!deleting[notice.id]"
                                :aria-label="`${$t('admin.notices.delete')}: ${notice.title}`"
                                @click="deleteNotice(notice)"
                            >
                                {{ $t('admin.notices.delete') }}
                            </el-button>
                        </header>
                        <p class="admin-notices__content">{{ notice.content }}</p>
                        <p class="admin-notices__time">{{ formatTime(notice.publishedAt) }}</p>
                        <p v-if="deleteErrors[notice.id]" class="admin-notices__error" role="alert">
                            {{ deleteErrors[notice.id] }}
                        </p>
                    </article>
                </div>
            </AppAsyncState>
        </section>

        <el-dialog
            v-model="createOpen"
            :title="$t('admin.notices.create_title')"
            width="min(680px, calc(100vw - 32px))"
            destroy-on-close
            :close-on-click-modal="false"
            :close-on-press-escape="!creating"
            :show-close="!creating"
            :before-close="beforeClose"
            @closed="resetForm"
        >
            <p
                v-if="createError"
                id="notice-create-error"
                class="admin-notices__error"
                tabindex="-1"
                role="alert"
            >
                {{ createError }}
            </p>
            <p v-if="sessionExpired" class="admin-notices__help">
                <NuxtLink :to="loginPath">{{ $t('auth.login.submit') }}</NuxtLink>
            </p>
            <el-form
                method="post"
                label-position="top"
                :disabled="creating"
                @submit.prevent="handleCreate"
            >
                <el-form-item
                    for="notice-title"
                    :label="$t('admin.notices.notice_title')"
                    :error="fieldErrors.title"
                >
                    <el-input
                        id="notice-title"
                        v-model="form.title"
                        :aria-invalid="!!fieldErrors.title"
                        :aria-describedby="fieldErrors.title ? 'notice-title-error' : undefined"
                        @input="touch('title')"
                        @blur="touch('title')"
                    />
                    <template #error="{ error }"
                        ><span id="notice-title-error">{{ error }}</span></template
                    >
                </el-form-item>
                <el-form-item
                    for="notice-content"
                    :label="$t('admin.notices.notice_content')"
                    :error="fieldErrors.content"
                >
                    <AppInputFormatHint id="notice-content-format" format="html" />
                    <el-input
                        id="notice-content"
                        v-model="form.content"
                        type="textarea"
                        :autosize="{ minRows: 5, maxRows: 12 }"
                        :aria-invalid="!!fieldErrors.content"
                        :aria-describedby="
                            fieldErrors.content
                                ? 'notice-content-format notice-content-error notice-content-help'
                                : 'notice-content-format notice-content-help'
                        "
                        @input="touch('content')"
                        @blur="touch('content')"
                    />
                    <p id="notice-content-help" class="admin-notices__help">
                        {{ $t('admin.workbench.content_limit') }}
                    </p>
                    <template #error="{ error }"
                        ><span id="notice-content-error">{{ error }}</span></template
                    >
                </el-form-item>
                <el-form-item :error="fieldErrors.pinned">
                    <el-checkbox
                        id="notice-pinned"
                        v-model="form.pinned"
                        :aria-invalid="!!fieldErrors.pinned"
                        :aria-describedby="fieldErrors.pinned ? 'notice-pinned-error' : undefined"
                        @change="touch('pinned')"
                    >
                        {{ $t('admin.notices.pinned') }}
                    </el-checkbox>
                    <template #error="{ error }"
                        ><span id="notice-pinned-error">{{ error }}</span></template
                    >
                </el-form-item>
                <div class="admin-notices__form-actions">
                    <el-button native-type="button" :disabled="creating" @click="closeCreate">{{
                        $t('common.cancel')
                    }}</el-button>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="creating"
                        :disabled="creating"
                    >
                        {{ creating ? $t('admin.notices.creating') : $t('admin.notices.create') }}
                    </el-button>
                </div>
            </el-form>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { Bell } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import AdminSectionNav from '~/components/admin/AdminSectionNav.vue';
import { formatCSTTime } from '~/utils/time';
import { adminRequestError } from '~/utils/admin-feedback';
import { noticeCreateSchema } from '~/utils/admin-validation';
import { buildLoginPath } from '~/utils/auth-redirect';
import type { NoticeSummary } from '~/types/api';

definePageMeta({ middleware: 'admin' });
const { t } = useI18n();
useHead({ title: () => `${t('admin.notices.tab')} - CP OAuth` });

const api = useApi();
const route = useRoute();
const loginPath = computed(() => buildLoginPath(route.fullPath));
const sessionExpired = ref(false);
const loading = ref(false);
const creating = ref(false);
const createOpen = ref(false);
const loadError = ref('');
const createError = ref('');
const serverFields = ref<Record<string, string>>({});
const touched = reactive<Record<string, boolean>>({});
const submitted = ref(false);
const deleting = reactive<Record<string, boolean>>({});
const deleteErrors = reactive<Record<string, string>>({});
const notices = ref<NoticeSummary[]>([]);
const form = reactive({ title: '', content: '', pinned: false });
const parsedForm = computed(() => noticeCreateSchema.safeParse(form));
const fieldErrors = computed(() => {
    const errors: Record<string, string> = {};
    if (!parsedForm.value.success) {
        for (const issue of parsedForm.value.error.issues) {
            const field = String(issue.path[0]);
            if (!submitted.value && !touched[field]) continue;
            errors[field] =
                issue.code === 'too_big'
                    ? t('admin.workbench.max_characters', { max: 120 })
                    : issue.code === 'custom'
                      ? t('admin.workbench.content_limit')
                      : t('admin.workbench.required');
        }
    }
    return { ...errors, ...serverFields.value };
});
const hasDraft = computed(() => !!(form.title || form.content || form.pinned));

function touch(field: string) {
    touched[field] = true;
    Reflect.deleteProperty(serverFields.value, field);
    createError.value = '';
}

function resetForm() {
    Object.assign(form, { title: '', content: '', pinned: false });
    serverFields.value = {};
    for (const field of Object.keys(touched)) Reflect.deleteProperty(touched, field);
    submitted.value = false;
    createError.value = '';
}

async function beforeClose(done: () => void) {
    if (creating.value) return;
    if (hasDraft.value) {
        try {
            await ElMessageBox.confirm(t('admin.workbench.discard_changes'), t('common.confirm'), {
                confirmButtonText: t('admin.workbench.discard'),
                cancelButtonText: t('common.cancel'),
                type: 'warning'
            });
        } catch {
            return;
        }
    }
    done();
}

function closeCreate() {
    void beforeClose(() => {
        createOpen.value = false;
    });
}

function formatTime(raw: string): string {
    return formatCSTTime(raw, { withSeconds: true, withTimezone: true });
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
    if ((response.response?.status ?? response.statusCode ?? response.status) === 401) {
        failure.message = t('admin.workbench.session_expired');
        sessionExpired.value = true;
    }
    return failure;
}

let controller: AbortController | undefined;
let sequence = 0;
onBeforeUnmount(() => {
    sequence++;
    controller?.abort();
});

async function loadNotices() {
    controller?.abort();
    controller = new AbortController();
    const current = ++sequence;
    loading.value = true;
    loadError.value = '';
    try {
        const data = await api<{ notices: NoticeSummary[] }>('/api/admin/notices', {
            signal: controller.signal
        });
        if (current === sequence) {
            notices.value = data.notices;
            sessionExpired.value = false;
        }
    } catch (error) {
        if (current === sequence) loadError.value = requestError(error).message;
    } finally {
        if (current === sequence) loading.value = false;
    }
}

async function focusError() {
    await nextTick();
    const firstField = ['title', 'content', 'pinned'].find(field => fieldErrors.value[field]);
    const target =
        document.getElementById(`notice-${firstField}`) ||
        document.getElementById('notice-create-error');
    target?.focus();
}

async function handleCreate() {
    if (creating.value) return;
    submitted.value = true;
    serverFields.value = {};
    createError.value = '';
    const parsed = parsedForm.value;
    if (!parsed.success) {
        createError.value = t('admin.workbench.validation_error');
        await focusError();
        return;
    }
    creating.value = true;
    try {
        await api('/api/admin/notices', { method: 'POST', body: parsed.data });
        resetForm();
        createOpen.value = false;
        ElMessage.success(t('admin.notices.created'));
        await loadNotices();
    } catch (error) {
        const failure = requestError(error);
        createError.value = failure.message;
        serverFields.value = failure.fields;
        creating.value = false;
        await focusError();
    } finally {
        creating.value = false;
    }
}

async function deleteNotice(notice: NoticeSummary) {
    const id = notice.id;
    if (deleting[id]) return;
    deleting[id] = true;
    Reflect.deleteProperty(deleteErrors, id);
    try {
        try {
            await ElMessageBox.confirm(
                t('admin.notices.delete_confirm', { title: notice.title }),
                t('admin.notices.delete'),
                {
                    confirmButtonText: t('admin.notices.delete'),
                    confirmButtonClass: 'el-button--danger',
                    cancelButtonText: t('common.cancel'),
                    type: 'warning'
                }
            );
        } catch {
            return;
        }
        await api(`/api/admin/notices/${id}`, { method: 'DELETE' });
        ElMessage.success(t('admin.notices.deleted'));
        await loadNotices();
    } catch (error) {
        deleteErrors[id] = requestError(error).message;
    } finally {
        Reflect.deleteProperty(deleting, id);
    }
}

await loadNotices();
</script>

<style scoped lang="scss">
.admin-notices {
    min-width: 0;

    &__results {
        padding: var(--panel-padding);

        > h2 {
            margin-bottom: var(--space-4);
        }
    }

    &__list {
        border-top: 1px solid var(--border-color);
    }

    &__item {
        padding: var(--space-4) 0;
        border-bottom: 1px solid var(--border-color);
        min-width: 0;

        &:last-child {
            padding-bottom: 0;
            border-bottom: 0;
        }
    }

    &__item-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: var(--space-4);
    }

    &__meta {
        min-width: 0;

        h3 {
            margin: 0;
            overflow-wrap: anywhere;
        }
    }

    &__pin,
    &__time,
    &__help {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
    }

    &__pin,
    &__time {
        font-size: var(--font-size-meta);
    }

    &__pin {
        display: block;
        margin-top: var(--space-1);
    }

    &__content {
        margin: var(--space-3) 0;
        font-size: var(--font-size-control);
        line-height: 1.85;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    &__help {
        margin: var(--space-2) 0 0;
    }

    &__error {
        color: var(--el-color-danger);
        overflow-wrap: anywhere;
        margin-bottom: var(--space-3);
    }

    &__form-actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: var(--space-2);
    }

    &__form-actions :deep(.el-button) {
        margin: 0;
    }
}
</style>
