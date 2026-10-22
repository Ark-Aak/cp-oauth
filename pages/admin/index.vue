<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.admin')"
            :title="t('common.nav.adminUsers')"
            :description="t('admin.users.description')"
        />

        <form class="admin-users__toolbar" role="search" @submit.prevent="applySearch">
            <el-input
                v-model="search"
                class="admin-users__search"
                type="search"
                maxlength="100"
                clearable
                :placeholder="t('admin.users.searchPlaceholder')"
                :aria-label="t('common.actions.search')"
                @clear="applySearch"
            >
                <template #prefix><Search :size="14" aria-hidden="true" /></template>
            </el-input>
            <el-button native-type="submit">{{ t('common.actions.search') }}</el-button>
            <span v-if="data" class="cp-help cp-num">{{
                t('admin.users.total', { n: number(data.total) })
            }}</span>
        </form>

        <CpSheet flush>
            <CpDataState
                :pending="pending"
                :error="error ? describe(error) : null"
                :empty="!data?.users.length"
                :empty-text="query ? t('admin.users.noMatches') : t('admin.users.empty')"
                :rows="6"
                @retry="refresh"
            >
                <ul class="cp-rows">
                    <li v-for="item in data?.users" :key="item.id" class="admin-users__row">
                        <CpAvatar :name="item.displayName || item.username" :size="32" />
                        <div class="cp-rows__main">
                            <NuxtLink :to="`/user/${item.username}`" class="cp-rows__title">
                                {{ item.displayName || item.username }}
                            </NuxtLink>
                            <span class="cp-rows__meta cp-mono"
                                >@{{ item.username }} · {{ item.email }}</span
                            >
                        </div>
                        <div class="admin-users__facts">
                            <CpStatus
                                :tone="item.role === 'admin' ? 'accent' : 'info'"
                                :label="t(`admin.users.roles.${item.role}`)"
                            />
                            <CpStatus
                                :tone="item.emailVerified ? 'success' : 'warning'"
                                :label="
                                    item.emailVerified
                                        ? t('admin.users.verified')
                                        : t('admin.users.unverified')
                                "
                            />
                            <span class="cp-rows__meta">{{ date(item.createdAt) }}</span>
                        </div>
                        <div class="cp-rows__end">
                            <el-dropdown
                                trigger="click"
                                @command="(command: string) => act(item, command)"
                            >
                                <el-button size="small" :loading="busy === item.id">
                                    {{ t('admin.users.actions') }}
                                </el-button>
                                <template #dropdown>
                                    <el-dropdown-menu>
                                        <el-dropdown-item command="role">
                                            {{
                                                item.role === 'admin'
                                                    ? t('admin.users.removeAdmin')
                                                    : t('admin.users.makeAdmin')
                                            }}
                                        </el-dropdown-item>
                                        <el-dropdown-item command="verify">
                                            {{
                                                item.emailVerified
                                                    ? t('admin.users.markUnverified')
                                                    : t('admin.users.markVerified')
                                            }}
                                        </el-dropdown-item>
                                        <el-dropdown-item
                                            command="delete"
                                            divided
                                            class="admin-users__danger"
                                        >
                                            {{ t('admin.users.delete') }}
                                        </el-dropdown-item>
                                    </el-dropdown-menu>
                                </template>
                            </el-dropdown>
                        </div>
                    </li>
                </ul>
            </CpDataState>
            <template v-if="data && data.total > data.pageSize" #footer>
                <el-pagination
                    layout="prev, pager, next"
                    :total="data.total"
                    :page-size="data.pageSize"
                    :current-page="page"
                    @current-change="goToPage"
                />
            </template>
        </CpSheet>
    </div>
</template>

<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import type { AdminUser } from '~/types/api';

interface UsersPage {
    users: AdminUser[];
    total: number;
    page: number;
    pageSize: number;
}

definePageMeta({ middleware: 'admin' });

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const router = useRouter();
const { describe } = useApiError();
const { date, number } = useFormat();
const session = useSession();

useHead({ title: t('common.nav.adminUsers') });

const query = computed(() => (typeof route.query.search === 'string' ? route.query.search : ''));
const page = computed(() => {
    const value = Number(route.query.page);
    return Number.isInteger(value) && value > 0 ? value : 1;
});
const search = ref(query.value);
watch(query, value => {
    search.value = value;
});

const { data, pending, error, refresh } = await useAsyncData(
    'admin-users',
    () =>
        api<UsersPage>('/api/admin/users', {
            query: { search: query.value, page: String(page.value) }
        }),
    { watch: [query, page] }
);

function applySearch() {
    const value = search.value.trim();
    void router.replace({ query: { ...(value ? { search: value } : {}) } });
}

function goToPage(next: number) {
    void router.replace({ query: { ...route.query, page: next > 1 ? String(next) : undefined } });
}

const busy = ref<string | null>(null);

async function confirm(message: string, title: string, action: string, danger = false) {
    try {
        await ElMessageBox.confirm(message, title, {
            type: 'warning',
            confirmButtonText: action,
            cancelButtonText: t('common.actions.cancel'),
            ...(danger ? { confirmButtonClass: 'el-button--danger' } : {})
        });
        return true;
    } catch {
        return false;
    }
}

async function act(item: AdminUser, command: string) {
    const self = item.id === session.user.value?.id;
    const name = item.displayName || item.username;
    let ok = true;
    if (command === 'role') {
        const next = item.role === 'admin' ? 'user' : 'admin';
        const message =
            self && next === 'user'
                ? t('admin.users.selfDemote')
                : t(
                      next === 'admin'
                          ? 'admin.users.makeAdminConfirm'
                          : 'admin.users.removeAdminConfirm',
                      { name }
                  );
        ok = await confirm(
            message,
            t(next === 'admin' ? 'admin.users.makeAdmin' : 'admin.users.removeAdmin'),
            t('common.actions.confirm')
        );
        if (!ok) return;
        await run(
            item,
            () => api(`/api/admin/users/${item.id}`, { method: 'PATCH', body: { role: next } }),
            self
        );
    } else if (command === 'verify') {
        await run(item, () =>
            api(`/api/admin/users/${item.id}`, {
                method: 'PATCH',
                body: { emailVerified: !item.emailVerified }
            })
        );
    } else if (command === 'delete') {
        ok = await confirm(
            self ? t('admin.users.selfDelete') : t('admin.users.deleteConfirm', { name }),
            t('admin.users.delete'),
            t('common.actions.delete'),
            true
        );
        if (!ok) return;
        await run(item, () => api(`/api/admin/users/${item.id}`, { method: 'DELETE' }), self);
    }
}

async function run(item: AdminUser, task: () => Promise<unknown>, signsOut = false) {
    busy.value = item.id;
    try {
        await task();
        if (signsOut) {
            await session.refresh();
            await navigateTo(session.user.value ? '/' : '/login');
            return;
        }
        ElMessage.success(t('common.states.saved'));
        await refresh();
    } catch (cause) {
        ElMessage.error(describe(cause));
    } finally {
        busy.value = null;
    }
}
</script>

<style scoped lang="scss">
.admin-users__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cp-space-2) var(--cp-space-3);
    margin-bottom: var(--cp-space-4);

    .el-button + .el-button {
        margin-left: 0;
    }
}

.admin-users__search {
    width: min(360px, 100%);
}

.admin-users__facts {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cp-space-2) var(--cp-space-4);
}

:global(.admin-users__danger) {
    color: var(--cp-danger);
}
</style>
