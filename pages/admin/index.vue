<template>
    <div class="admin-users">
        <AppPageHeader
            :title="$t('admin.users.tab')"
            :description="$t('admin.workbench.users_description')"
        />
        <AdminSectionNav current="users" />
        <p v-if="sessionExpired" class="admin-users__query-error">
            <NuxtLink :to="loginPath">{{ $t('auth.login.submit') }}</NuxtLink>
        </p>

        <section class="admin-users__results ui-card" :aria-label="$t('admin.users.tab')">
            <div class="admin-users__search">
                <label for="admin-user-search">{{ $t('admin.users.search') }}</label>
                <el-input
                    id="admin-user-search"
                    v-model="search"
                    clearable
                    :aria-invalid="!!fieldErrors.search"
                    :aria-describedby="fieldErrors.search ? 'admin-user-search-error' : undefined"
                    @input="debouncedLoad"
                />
                <p
                    v-if="fieldErrors.search"
                    id="admin-user-search-error"
                    class="admin-users__error"
                    role="alert"
                >
                    {{ fieldErrors.search }}
                </p>
            </div>
            <div v-if="fieldErrors.page" class="admin-users__query-error" role="alert">
                <p>{{ fieldErrors.page }}</p>
                <el-button native-type="button" @click="changePage(1)">
                    {{ $t('admin.workbench.first_page') }}
                </el-button>
            </div>

            <AppAsyncState
                :pending="tableLoading"
                :error="loadError"
                :empty="users.length === 0"
                :empty-text="$t('admin.users.no_results')"
                :empty-icon="UsersRound"
                @retry="loadUsers"
            >
                <p class="admin-users__result-count" role="status">
                    {{ $t('admin.workbench.results', { count: total }) }}
                </p>
                <div class="admin-users__table-wrap">
                    <table class="admin-users__table">
                        <thead>
                            <tr>
                                <th scope="col">{{ $t('admin.users.username') }}</th>
                                <th scope="col">{{ $t('admin.users.email') }}</th>
                                <th scope="col">{{ $t('admin.users.role') }}</th>
                                <th scope="col">{{ $t('admin.users.verified') }}</th>
                                <th scope="col">{{ $t('admin.users.actions') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="row in users"
                                :key="row.id"
                                :aria-busy="isRowPending(row.id)"
                            >
                                <td>
                                    <strong>{{ row.displayName || row.username }}</strong>
                                    <span class="admin-users__username">@{{ row.username }}</span>
                                </td>
                                <td>{{ row.email }}</td>
                                <td>
                                    <el-select
                                        :model-value="row.role"
                                        :disabled="isRowPending(row.id)"
                                        :aria-label="`${$t('admin.users.role')}: ${row.username}`"
                                        @change="(value: string) => updateRole(row, value)"
                                    >
                                        <el-option
                                            value="user"
                                            :label="$t('admin.workbench.role_user')"
                                        />
                                        <el-option
                                            value="admin"
                                            :label="$t('admin.workbench.role_admin')"
                                        />
                                    </el-select>
                                </td>
                                <td>
                                    {{
                                        $t(
                                            row.emailVerified
                                                ? 'admin.workbench.email_verified'
                                                : 'admin.workbench.email_unverified'
                                        )
                                    }}
                                </td>
                                <td>
                                    <div class="admin-users__actions">
                                        <el-button
                                            v-if="!row.emailVerified"
                                            native-type="button"
                                            :loading="!!verificationPending[row.id]"
                                            :disabled="isRowPending(row.id)"
                                            :aria-label="`${$t('admin.users.verify')}: ${row.username}`"
                                            @click="verifyUser(row)"
                                        >
                                            {{ $t('admin.users.verify') }}
                                        </el-button>
                                        <el-button
                                            type="danger"
                                            plain
                                            native-type="button"
                                            :loading="!!deletionPending[row.id]"
                                            :disabled="isRowPending(row.id)"
                                            :aria-label="`${$t('admin.users.delete')}: ${row.username}`"
                                            @click="deleteUser(row)"
                                        >
                                            {{ $t('admin.users.delete') }}
                                        </el-button>
                                    </div>
                                    <p
                                        v-if="rowErrors[row.id]"
                                        class="admin-users__error"
                                        role="alert"
                                    >
                                        {{ rowErrors[row.id] }}
                                    </p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <ul class="admin-users__cards">
                    <li
                        v-for="row in users"
                        :key="row.id"
                        class="admin-users__card"
                        :aria-busy="isRowPending(row.id)"
                    >
                        <h2>{{ row.displayName || row.username }}</h2>
                        <p class="admin-users__username">@{{ row.username }}</p>
                        <dl>
                            <div>
                                <dt>{{ $t('admin.users.email') }}</dt>
                                <dd>{{ row.email }}</dd>
                            </div>
                            <div>
                                <dt>{{ $t('admin.users.verified') }}</dt>
                                <dd>
                                    {{
                                        $t(
                                            row.emailVerified
                                                ? 'admin.workbench.email_verified'
                                                : 'admin.workbench.email_unverified'
                                        )
                                    }}
                                </dd>
                            </div>
                        </dl>
                        <label :for="`admin-role-${row.id}`">{{ $t('admin.users.role') }}</label>
                        <el-select
                            :id="`admin-role-${row.id}`"
                            :model-value="row.role"
                            :disabled="isRowPending(row.id)"
                            @change="(value: string) => updateRole(row, value)"
                        >
                            <el-option value="user" :label="$t('admin.workbench.role_user')" />
                            <el-option value="admin" :label="$t('admin.workbench.role_admin')" />
                        </el-select>
                        <div class="admin-users__actions">
                            <el-button
                                v-if="!row.emailVerified"
                                native-type="button"
                                :loading="!!verificationPending[row.id]"
                                :disabled="isRowPending(row.id)"
                                :aria-label="`${$t('admin.users.verify')}: ${row.username}`"
                                @click="verifyUser(row)"
                            >
                                {{ $t('admin.users.verify') }}
                            </el-button>
                            <el-button
                                type="danger"
                                plain
                                native-type="button"
                                :loading="!!deletionPending[row.id]"
                                :disabled="isRowPending(row.id)"
                                :aria-label="`${$t('admin.users.delete')}: ${row.username}`"
                                @click="deleteUser(row)"
                            >
                                {{ $t('admin.users.delete') }}
                            </el-button>
                        </div>
                        <p v-if="rowErrors[row.id]" class="admin-users__error" role="alert">
                            {{ rowErrors[row.id] }}
                        </p>
                    </li>
                </ul>

                <el-pagination
                    v-if="totalPages > 1"
                    :current-page="page"
                    :page-size="20"
                    :total="total"
                    :pager-count="5"
                    layout="prev, pager, next"
                    class="admin-users__pagination"
                    @current-change="changePage"
                />
            </AppAsyncState>
        </section>
    </div>
</template>

<script setup lang="ts">
import { UsersRound } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import AdminSectionNav from '~/components/admin/AdminSectionNav.vue';
import { adminUsersQuerySchema } from '~/utils/admin-validation';
import type { AdminUser } from '~/types/api';
import { adminRequestError } from '~/utils/admin-feedback';
import { buildLoginPath } from '~/utils/auth-redirect';

definePageMeta({ middleware: 'admin' });
const { t } = useI18n();

useHead({ title: () => `${t('admin.users.tab')} - CP OAuth` });
const api = useApi();
const route = useRoute();
const router = useRouter();
const loginPath = computed(() => buildLoginPath(route.fullPath));
const sessionExpired = ref(false);
const users = ref<AdminUser[]>([]);
const search = ref(typeof route.query.search === 'string' ? route.query.search : '');
const page = ref(pageFromQuery(route.query.page));
const total = ref(0);
const tableLoading = ref(false);
const loadError = ref('');
const fieldErrors = ref<Record<string, string>>({});
const rowErrors = reactive<Record<string, string>>({});
const rolePending = reactive<Record<string, boolean>>({});
const verificationPending = reactive<Record<string, boolean>>({});
const deletionPending = reactive<Record<string, boolean>>({});
const totalPages = computed(() => Math.ceil(total.value / 20) || 1);

function pageFromQuery(value: unknown): number {
    const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 1;
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000_000 ? parsed : 1;
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
        data?: { data?: { code?: string } };
    };
    const status = response.response?.status ?? response.statusCode ?? response.status;
    if (status === 401) {
        failure.message = t('admin.workbench.session_expired');
        sessionExpired.value = true;
    }
    if (status === 409) {
        failure.message = t(
            response.data?.data?.code === 'LAST_ADMIN'
                ? 'admin.workbench.last_admin'
                : 'admin.workbench.conflict'
        );
    }
    return failure;
}

function isRowPending(id: string) {
    return (
        tableLoading.value || !!(rolePending[id] || verificationPending[id] || deletionPending[id])
    );
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;
let requestSequence = 0;

function cancelLoad() {
    requestSequence++;
    controller?.abort();
}

function debouncedLoad() {
    clearTimeout(debounceTimer);
    cancelLoad();
    tableLoading.value = true;
    if (search.value.length > 100) {
        tableLoading.value = false;
        fieldErrors.value = { search: t('admin.workbench.max_characters', { max: 100 }) };
        loadError.value = t('admin.workbench.validation_error');
        return;
    }
    debounceTimer = setTimeout(() => {
        void changePage(1);
    }, 300);
}

async function changePage(value: number) {
    clearTimeout(debounceTimer);
    const query = { ...route.query, page: String(value), search: search.value || undefined };
    if (route.query.page === query.page && (route.query.search || undefined) === query.search) {
        page.value = value;
        await loadUsers();
    } else {
        await router.push({ query });
    }
}

watch([() => route.query.page, () => route.query.search], () => {
    clearTimeout(debounceTimer);
    search.value = typeof route.query.search === 'string' ? route.query.search : '';
    page.value = pageFromQuery(route.query.page);
    void loadUsers();
});

onBeforeUnmount(() => {
    clearTimeout(debounceTimer);
    cancelLoad();
});

async function loadUsers() {
    cancelLoad();
    const sequence = requestSequence;
    controller = new AbortController();
    tableLoading.value = true;
    loadError.value = '';
    fieldErrors.value = {};
    const parsed = adminUsersQuerySchema.safeParse({
        search: route.query.search ?? search.value,
        page: route.query.page ?? String(page.value)
    });
    if (!parsed.success) {
        for (const issue of parsed.error.issues) {
            const field = String(issue.path[0]);
            fieldErrors.value[field] =
                field === 'page'
                    ? t('admin.workbench.page_range')
                    : t('admin.workbench.max_characters', { max: 100 });
        }
        loadError.value = t('admin.workbench.validation_error');
        tableLoading.value = false;
        return;
    }
    try {
        const data = await api<{
            users: AdminUser[];
            total: number;
            page: number;
            pageSize: number;
        }>('/api/admin/users', {
            params: { search: parsed.data.search, page: parsed.data.page },
            signal: controller.signal
        });
        if (sequence !== requestSequence) return;
        sessionExpired.value = false;
        users.value = data.users;
        total.value = data.total;
    } catch (error) {
        if (sequence !== requestSequence) return;
        const failure = requestError(error);
        loadError.value = failure.message;
        fieldErrors.value = failure.fields;
    } finally {
        if (sequence === requestSequence) tableLoading.value = false;
    }
}

async function confirmAction(message: string): Promise<boolean> {
    try {
        await ElMessageBox.confirm(message, t('common.confirm'), {
            confirmButtonText: t('common.confirm'),
            cancelButtonText: t('common.cancel'),
            type: 'warning'
        });
        return true;
    } catch {
        return false;
    }
}

async function updateRole(row: AdminUser, role: string) {
    if (isRowPending(row.id) || role === row.role || !['user', 'admin'].includes(role)) return;
    rolePending[row.id] = true;
    Reflect.deleteProperty(rowErrors, row.id);
    try {
        if (
            !(await confirmAction(
                t('admin.users.role_confirm', {
                    user: `${row.username} (${row.email})`,
                    role: t(
                        role === 'admin'
                            ? 'admin.workbench.role_admin'
                            : 'admin.workbench.role_user'
                    )
                })
            ))
        )
            return;
        await api(`/api/admin/users/${row.id}`, { method: 'PATCH', body: { role } });
        ElMessage.success(t('common.success'));
        await loadUsers();
    } catch (error) {
        rowErrors[row.id] = requestError(error).message;
    } finally {
        Reflect.deleteProperty(rolePending, row.id);
    }
}

async function verifyUser(row: AdminUser) {
    if (isRowPending(row.id)) return;
    verificationPending[row.id] = true;
    Reflect.deleteProperty(rowErrors, row.id);
    try {
        if (
            !(await confirmAction(
                t('admin.users.verify_confirm', { user: `${row.username} (${row.email})` })
            ))
        )
            return;
        await api(`/api/admin/users/${row.id}`, { method: 'PATCH', body: { emailVerified: true } });
        ElMessage.success(t('common.success'));
        await loadUsers();
    } catch (error) {
        rowErrors[row.id] = requestError(error).message;
    } finally {
        Reflect.deleteProperty(verificationPending, row.id);
    }
}

async function deleteUser(row: AdminUser) {
    const id = row.id;
    if (isRowPending(id)) return;
    deletionPending[id] = true;
    Reflect.deleteProperty(rowErrors, id);
    try {
        if (
            !(await confirmAction(
                `${row.username} (${row.email}): ${t('admin.users.delete_confirm')}`
            ))
        )
            return;
        await api(`/api/admin/users/${id}`, { method: 'DELETE' });
        ElMessage.success(t('admin.users.deleted'));
        if (users.value.length === 1 && page.value > 1) await changePage(page.value - 1);
        else await loadUsers();
    } catch (error) {
        rowErrors[id] = requestError(error).message;
    } finally {
        Reflect.deleteProperty(deletionPending, id);
    }
}

await loadUsers();
</script>

<style scoped lang="scss">
.admin-users {
    min-width: 0;

    &__results {
        padding: var(--panel-padding);
    }

    &__search {
        display: grid;
        gap: var(--space-2);
        max-width: 480px;
        margin-bottom: var(--space-5);
    }

    &__search label {
        font-size: var(--font-size-control);
        font-weight: 600;
    }

    &__query-error {
        margin-bottom: var(--space-4);
        overflow-wrap: anywhere;
    }

    &__result-count {
        margin-bottom: var(--space-3);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
    }

    &__table-wrap {
        width: 100%;
        overflow-x: auto;
    }

    &__table {
        width: 100%;
        min-width: 720px;
        border-collapse: collapse;
        table-layout: fixed;

        th,
        td {
            padding: var(--space-3);
            border-bottom: 1px solid var(--border-color);
            text-align: left;
            vertical-align: top;
            overflow-wrap: anywhere;
        }

        th {
            color: var(--text-secondary);
            font-weight: 600;
            font-size: var(--font-size-control);
        }

        th:nth-child(3) {
            width: 136px;
        }
        th:nth-child(4) {
            width: 100px;
        }
        th:nth-child(5) {
            width: 172px;
        }
    }

    &__username {
        display: block;
        color: var(--text-secondary);
        font-size: var(--font-size-meta);
        overflow-wrap: anywhere;
    }

    &__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }

    &__actions :deep(.el-button) {
        margin: 0;
        max-width: 100%;
        min-height: 44px;
        height: auto;
        white-space: normal;
    }

    &__error {
        margin-top: var(--space-2);
        color: var(--el-color-danger);
        font-size: var(--font-size-control);
        overflow-wrap: anywhere;
    }

    &__cards {
        display: none;
    }

    &__pagination {
        margin-top: var(--space-5);
        justify-content: center;
        flex-wrap: wrap;
    }
}

@media (max-width: 767px) {
    .admin-users {
        &__table-wrap {
            display: none;
        }

        &__cards {
            display: grid;
            padding: 0;
            margin: 0;
            list-style: none;
        }

        &__card {
            min-width: 0;
            padding: var(--space-4) 0;
            border-bottom: 1px solid var(--border-color);

            &:first-child {
                padding-top: 0;
            }

            &:last-child {
                padding-bottom: 0;
                border-bottom: 0;
            }

            h2,
            dd {
                overflow-wrap: anywhere;
            }
            h2 {
                margin: 0;
            }
            dl {
                margin: var(--space-3) 0;
            }
            dt {
                color: var(--text-secondary);
                font-size: var(--font-size-control);
            }
            dd {
                margin: 0 0 var(--space-2);
            }
            label {
                display: block;
                margin-bottom: var(--space-2);
            }
        }

        &__actions {
            margin-top: var(--space-3);
        }
    }
}
</style>
