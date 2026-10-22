<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.account')"
            :title="t('common.nav.apps')"
            :description="t('account.apps.description')"
        />

        <CpSheet flush>
            <CpDataState
                :pending="pending"
                :error="error ? describe(error) : null"
                :empty="!apps?.length"
                :empty-text="t('account.apps.empty')"
                @retry="refresh"
            >
                <ul class="cp-rows">
                    <li v-for="app in apps" :key="app.clientId" class="apps__row">
                        <div class="cp-rows__main">
                            <span class="cp-rows__title">{{ app.name }}</span>
                            <span class="cp-rows__meta cp-mono">{{ app.clientId }}</span>
                            <span class="apps__scopes">
                                <code
                                    v-for="scope in app.scopes"
                                    :key="scope"
                                    class="cp-mono"
                                    :title="scopeText.title(scope)"
                                    >{{ scope }}</code
                                >
                            </span>
                        </div>
                        <dl class="apps__facts">
                            <div>
                                <dt>{{ t('account.apps.lastAuthorized') }}</dt>
                                <dd>{{ dateTime(app.latestAuthorizedAt) }}</dd>
                            </div>
                            <div>
                                <dt>{{ t('account.apps.activeTokens') }}</dt>
                                <dd class="cp-num">
                                    {{ number(app.accessTokenCount + app.refreshTokenCount) }}
                                </dd>
                            </div>
                        </dl>
                        <div class="cp-rows__end">
                            <el-button
                                type="danger"
                                plain
                                size="small"
                                :loading="revoking === app.clientId"
                                @click="revoke(app)"
                            >
                                {{ t('account.apps.revoke') }}
                            </el-button>
                        </div>
                    </li>
                </ul>
            </CpDataState>
        </CpSheet>
    </div>
</template>

<script setup lang="ts">
import type { AuthorizedApp } from '~/types/api';

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();
const { dateTime, number } = useFormat();
const scopeText = useScopeText();

const {
    data: apps,
    pending,
    error,
    refresh
} = await useAsyncData('profile-apps', () => api<AuthorizedApp[]>('/api/oauth/authorized-apps'));

const revoking = ref<string | null>(null);

async function revoke(app: AuthorizedApp) {
    try {
        await ElMessageBox.confirm(
            t('account.apps.revokeConfirm', { name: app.name }),
            t('account.apps.revokeTitle'),
            {
                type: 'warning',
                confirmButtonText: t('account.apps.revoke'),
                cancelButtonText: t('common.actions.cancel'),
                confirmButtonClass: 'el-button--danger'
            }
        );
    } catch {
        return;
    }
    revoking.value = app.clientId;
    try {
        const result = await api<{
            deletedAccessTokens: number;
            revokedRefreshTokens: number;
            deletedAuthorizationCodes: number;
        }>(`/api/oauth/authorized-apps/${encodeURIComponent(app.clientId)}`, { method: 'DELETE' });
        ElMessage.success(
            t('account.apps.revoked', {
                name: app.name,
                tokens: result.deletedAccessTokens + result.revokedRefreshTokens,
                codes: result.deletedAuthorizationCodes
            })
        );
        await refresh();
    } catch (cause) {
        ElMessage.error(describe(cause));
    } finally {
        revoking.value = null;
    }
}
</script>

<style scoped lang="scss">
.apps__row {
    align-items: flex-start;
}

.apps__scopes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cp-space-1) var(--cp-space-3);
    margin-top: var(--cp-space-1);
    font-size: var(--cp-text-sm);
    color: var(--cp-text-2);
}

.apps__facts {
    display: flex;
    flex: none;
    gap: var(--cp-space-5);

    dt {
        font-size: var(--cp-text-xs);
        color: var(--cp-text-3);
    }

    dd {
        font-size: var(--cp-text-sm);
        color: var(--cp-text);
    }

    .cp-num {
        text-align: right;
    }
}

@media (max-width: 767px) {
    .apps__facts {
        width: 100%;
    }
}
</style>
