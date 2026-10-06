<template>
    <div class="admin-showcase">
        <AppPageHeader
            :title="$t('admin.showcase.tab')"
            :description="$t('admin.workbench.showcase_description')"
        >
            <template #actions>
                <el-button type="primary" native-type="button" @click="createOpen = true">
                    {{ $t('admin.showcase.create_title') }}
                </el-button>
            </template>
        </AppPageHeader>
        <AdminSectionNav current="showcase" />
        <p v-if="sessionExpired" class="admin-showcase__help">
            <NuxtLink :to="loginPath">{{ $t('auth.login.submit') }}</NuxtLink>
        </p>

        <section class="admin-showcase__results ui-card" aria-labelledby="showcase-list-title">
            <h2 id="showcase-list-title">{{ $t('admin.showcase.list_title') }}</h2>
            <AppAsyncState
                :pending="loading"
                :error="loadError"
                :empty="items.length === 0"
                :empty-text="$t('admin.showcase.empty')"
                :empty-icon="Globe"
                @retry="loadItems"
            >
                <div class="admin-showcase__list">
                    <article
                        v-for="item in items"
                        :key="item.id"
                        class="admin-showcase__item"
                        :aria-busy="!!deleting[item.id]"
                    >
                        <div class="admin-showcase__item-info">
                            <p class="admin-showcase__category">
                                {{
                                    $t(
                                        item.category === 'site'
                                            ? 'admin.showcase.category_site'
                                            : 'admin.showcase.category_project'
                                    )
                                }}
                                · {{ $t('admin.showcase.sort_order') }}: {{ item.sortOrder }}
                            </p>
                            <h3>{{ item.name }}</h3>
                            <a
                                v-if="item.url"
                                :href="item.url"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="admin-showcase__url"
                                >{{ item.url }}</a
                            >
                            <p v-if="item.iconUrl" class="admin-showcase__icon-url">
                                {{ $t('admin.showcase.icon_url') }}: {{ item.iconUrl }}
                            </p>
                            <p
                                v-if="item.invalidUrls?.length"
                                class="admin-showcase__warning"
                                role="status"
                            >
                                {{ $t('admin.showcase.invalid_url_warning') }}
                                ({{
                                    item.invalidUrls
                                        .map(field =>
                                            $t(
                                                field === 'url'
                                                    ? 'admin.showcase.url'
                                                    : 'admin.showcase.icon_url'
                                            )
                                        )
                                        .join(', ')
                                }})
                            </p>
                            <p v-if="item.description" class="admin-showcase__description">
                                {{ item.description }}
                            </p>
                            <p
                                v-if="deleteErrors[item.id]"
                                class="admin-showcase__error"
                                role="alert"
                            >
                                {{ deleteErrors[item.id] }}
                            </p>
                        </div>
                        <el-button
                            type="danger"
                            plain
                            native-type="button"
                            :loading="!!deleting[item.id]"
                            :disabled="!!deleting[item.id]"
                            :aria-label="`${$t('admin.showcase.delete')}: ${item.name}`"
                            @click="handleDelete(item)"
                        >
                            {{ $t('admin.showcase.delete') }}
                        </el-button>
                    </article>
                </div>
            </AppAsyncState>
        </section>

        <el-dialog
            v-model="createOpen"
            :title="$t('admin.showcase.create_title')"
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
                id="showcase-create-error"
                class="admin-showcase__error"
                tabindex="-1"
                role="alert"
            >
                {{ createError }}
            </p>
            <p v-if="sessionExpired" class="admin-showcase__help">
                <NuxtLink :to="loginPath">{{ $t('auth.login.submit') }}</NuxtLink>
            </p>
            <el-form
                method="post"
                label-position="top"
                :disabled="creating"
                @submit.prevent="handleCreate"
            >
                <el-form-item
                    for="showcase-category"
                    :label="$t('admin.showcase.category')"
                    :error="fieldErrors.category"
                >
                    <el-select
                        id="showcase-category"
                        v-model="form.category"
                        :aria-invalid="!!fieldErrors.category"
                        :aria-describedby="
                            fieldErrors.category ? 'showcase-category-error' : undefined
                        "
                        @change="touch('category')"
                    >
                        <el-option value="site" :label="$t('admin.showcase.category_site')" />
                        <el-option value="project" :label="$t('admin.showcase.category_project')" />
                    </el-select>
                    <template #error="{ error }"
                        ><span id="showcase-category-error">{{ error }}</span></template
                    >
                </el-form-item>
                <el-form-item
                    v-for="field in textFields"
                    :key="field.key"
                    :for="`showcase-${field.key}`"
                    :label="$t(field.label)"
                    :error="fieldErrors[field.key]"
                >
                    <el-input
                        :id="`showcase-${field.key}`"
                        v-model="form[field.key]"
                        :type="field.key === 'description' ? 'textarea' : 'text'"
                        :autosize="
                            field.key === 'description' ? { minRows: 3, maxRows: 8 } : undefined
                        "
                        :aria-invalid="!!fieldErrors[field.key]"
                        :aria-describedby="describedBy(field.key)"
                        @input="touch(field.key)"
                        @blur="touch(field.key)"
                    />
                    <p
                        v-if="field.key === 'url' || field.key === 'iconUrl'"
                        :id="`showcase-${field.key}-help`"
                        class="admin-showcase__help"
                    >
                        {{
                            $t(
                                field.key === 'iconUrl'
                                    ? 'admin.showcase.icon_url_hint'
                                    : 'admin.workbench.http_url_hint'
                            )
                        }}
                    </p>
                    <template #error="{ error }"
                        ><span :id="`showcase-${field.key}-error`">{{ error }}</span></template
                    >
                </el-form-item>
                <el-form-item
                    for="showcase-sortOrder"
                    :label="$t('admin.showcase.sort_order')"
                    :error="fieldErrors.sortOrder"
                >
                    <el-input
                        id="showcase-sortOrder"
                        v-model="form.sortOrder"
                        inputmode="numeric"
                        :aria-invalid="!!fieldErrors.sortOrder"
                        :aria-describedby="
                            fieldErrors.sortOrder ? 'showcase-sortOrder-error' : undefined
                        "
                        @input="touch('sortOrder')"
                        @blur="touch('sortOrder')"
                    />
                    <template #error="{ error }"
                        ><span id="showcase-sortOrder-error">{{ error }}</span></template
                    >
                </el-form-item>
                <div class="admin-showcase__form-actions">
                    <el-button native-type="button" :disabled="creating" @click="closeCreate">{{
                        $t('common.cancel')
                    }}</el-button>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="creating"
                        :disabled="creating"
                    >
                        {{ creating ? $t('admin.showcase.creating') : $t('admin.showcase.create') }}
                    </el-button>
                </div>
            </el-form>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { Globe } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import AdminSectionNav from '~/components/admin/AdminSectionNav.vue';
import { adminRequestError } from '~/utils/admin-feedback';
import { showcaseCreateSchema } from '~/utils/admin-validation';
import { buildLoginPath } from '~/utils/auth-redirect';
import type { ShowcaseItem } from '~/types/api';

definePageMeta({ middleware: 'admin' });
const { t } = useI18n();
useHead({ title: () => `${t('admin.showcase.tab')} - CP OAuth` });

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
const items = ref<ShowcaseItem[]>([]);
const form = reactive({
    category: 'site',
    name: '',
    description: '',
    url: '',
    iconUrl: '',
    sortOrder: '0'
});
const textFields = [
    { key: 'name', label: 'admin.showcase.name' },
    { key: 'url', label: 'admin.showcase.url' },
    { key: 'description', label: 'admin.showcase.description' },
    { key: 'iconUrl', label: 'admin.showcase.icon_url' }
] as const;
const parsedForm = computed(() =>
    showcaseCreateSchema.safeParse({
        ...form,
        sortOrder: /^-?\d+$/.test(form.sortOrder) ? Number(form.sortOrder) : Number.NaN
    })
);
const fieldErrors = computed(() => {
    const errors: Record<string, string> = {};
    if (!parsedForm.value.success) {
        for (const issue of parsedForm.value.error.issues) {
            const field = String(issue.path[0]);
            if ((!submitted.value && !touched[field]) || errors[field]) continue;
            errors[field] =
                field === 'sortOrder'
                    ? t('admin.workbench.sort_range')
                    : issue.code === 'too_big'
                      ? t('admin.workbench.max_characters', { max: issue.maximum })
                      : field === 'url' || field === 'iconUrl'
                        ? t('admin.workbench.http_url_hint')
                        : field === 'category'
                          ? t('admin.workbench.choose_valid')
                          : t('admin.workbench.required');
        }
    }
    return { ...errors, ...serverFields.value };
});
const hasDraft = computed(
    () =>
        !!(
            form.name ||
            form.description ||
            form.url ||
            form.iconUrl ||
            form.category !== 'site' ||
            form.sortOrder !== '0'
        )
);

function describedBy(field: string) {
    return (
        [
            fieldErrors.value[field] ? `showcase-${field}-error` : '',
            field === 'url' || field === 'iconUrl' ? `showcase-${field}-help` : ''
        ]
            .filter(Boolean)
            .join(' ') || undefined
    );
}

function touch(field: string) {
    touched[field] = true;
    Reflect.deleteProperty(serverFields.value, field);
    createError.value = '';
}

function resetForm() {
    Object.assign(form, {
        category: 'site',
        name: '',
        description: '',
        url: '',
        iconUrl: '',
        sortOrder: '0'
    });
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

async function loadItems() {
    controller?.abort();
    controller = new AbortController();
    const current = ++sequence;
    loading.value = true;
    loadError.value = '';
    try {
        const data = await api<{ items: ShowcaseItem[] }>('/api/admin/showcase', {
            signal: controller.signal
        });
        if (current === sequence) {
            items.value = data.items;
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
    const firstField = ['category', 'name', 'url', 'description', 'iconUrl', 'sortOrder'].find(
        field => fieldErrors.value[field]
    );
    const target =
        document.getElementById(`showcase-${firstField}`) ||
        document.getElementById('showcase-create-error');
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
        await api('/api/admin/showcase', { method: 'POST', body: parsed.data });
        resetForm();
        createOpen.value = false;
        ElMessage.success(t('admin.showcase.created'));
        await loadItems();
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

async function handleDelete(item: ShowcaseItem) {
    const id = item.id;
    if (deleting[id]) return;
    deleting[id] = true;
    Reflect.deleteProperty(deleteErrors, id);
    try {
        try {
            await ElMessageBox.confirm(
                `${item.name}: ${t('admin.showcase.delete_confirm')}`,
                t('common.confirm'),
                {
                    confirmButtonText: t('admin.showcase.delete'),
                    cancelButtonText: t('common.cancel'),
                    type: 'warning'
                }
            );
        } catch {
            return;
        }
        await api(`/api/admin/showcase/${id}`, { method: 'DELETE' });
        ElMessage.success(t('admin.showcase.deleted'));
        await loadItems();
    } catch (error) {
        deleteErrors[id] = requestError(error).message;
    } finally {
        Reflect.deleteProperty(deleting, id);
    }
}

await loadItems();
</script>

<style scoped lang="scss">
.admin-showcase {
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
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-4);
        padding: var(--space-4) 0;
        border-bottom: 1px solid var(--border-color);

        &:last-child {
            padding-bottom: 0;
            border-bottom: 0;
        }
    }

    &__item-info {
        min-width: 0;
        flex: 1;

        h3 {
            margin: 0 0 var(--space-2);
            overflow-wrap: anywhere;
        }
    }

    &__category,
    &__help,
    &__icon-url {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        overflow-wrap: anywhere;
    }

    &__category {
        margin-bottom: var(--space-1);
        font-size: var(--font-size-meta);
    }

    &__url {
        display: block;
        overflow-wrap: anywhere;
    }

    &__icon-url,
    &__help,
    &__warning {
        margin-top: var(--space-2);
    }

    &__warning {
        color: var(--text-secondary);
        padding-left: var(--space-3);
        border-left: 2px solid var(--accent);
        overflow-wrap: anywhere;
    }

    &__description {
        margin-top: var(--space-3);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
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

@media (max-width: 479px) {
    .admin-showcase__item {
        flex-direction: column;
        gap: var(--space-3);
    }
}
</style>
