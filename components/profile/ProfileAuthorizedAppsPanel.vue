<template>
    <section class="profile-apps" aria-labelledby="profile-apps-title">
        <h2 id="profile-apps-title" ref="heading" tabindex="-1">
            {{ t('oauth.authorized_apps.title') }}
        </h2>
        <p class="profile-apps__intro">{{ t('oauth.authorized_apps.description') }}</p>
        <p
            v-if="mutationError"
            ref="errorElement"
            role="alert"
            tabindex="-1"
            class="profile-apps__error"
        >
            {{ mutationError }}
        </p>
        <p v-if="notice" role="status" aria-live="polite" class="profile-apps__notice">
            {{ notice }}
        </p>
        <AppAsyncState
            :pending="status === 'idle' || status === 'pending'"
            :error="error"
            :empty="status === 'success' && !apps.length"
            :empty-text="t('oauth.authorized_apps.no_apps')"
            :empty-icon="AppWindow"
            @retry="reload(true)"
        >
            <table class="profile-apps__table">
                <caption class="sr-only">
                    {{
                        t('oauth.authorized_apps.title')
                    }}
                </caption>
                <thead>
                    <tr>
                        <th scope="col">{{ t('profile.workbench.application') }}</th>
                        <th scope="col">{{ t('oauth.authorized_apps.scopes') }}</th>
                        <th scope="col">{{ t('profile.workbench.actions') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="app in apps" :key="app.clientId">
                        <th scope="row">
                            <strong>{{ app.name }}</strong>
                            <p class="profile-apps__id">{{ app.clientId }}</p>
                            <p class="profile-apps__meta">
                                {{ t('oauth.authorized_apps.authorized_at') }}:
                                {{ formatCSTTime(app.latestAuthorizedAt, { withTimezone: true }) }}
                            </p>
                            <p class="profile-apps__meta">
                                {{
                                    t('oauth.authorized_apps.access_tokens', {
                                        count: app.accessTokenCount
                                    })
                                }}
                            </p>
                            <p class="profile-apps__meta">
                                {{
                                    t('oauth.authorized_apps.refresh_tokens', {
                                        count: app.refreshTokenCount
                                    })
                                }}
                            </p>
                            <p class="profile-apps__meta">
                                {{
                                    t('profile.workbench.pending_codes', {
                                        count: app.pendingAuthorizationCodeCount
                                    })
                                }}
                            </p>
                        </th>
                        <td>
                            <ul class="profile-apps__scopes">
                                <li v-for="scope in app.scopes" :key="scope">
                                    {{ t(`oauth.scopes.${scope.replace(':', '_')}`) }}
                                </li>
                            </ul>
                        </td>
                        <td class="profile-apps__action-cell">
                            <el-button
                                type="danger"
                                plain
                                :loading="pendingClientId === app.clientId"
                                :disabled="busy"
                                :aria-label="
                                    t('profile.workbench.revoke_named', { name: app.name })
                                "
                                @click="confirmRevoke(app, $event)"
                                >{{ t('oauth.authorized_apps.revoke') }}</el-button
                            >
                        </td>
                    </tr>
                </tbody>
            </table>
            <div class="profile-apps__cards">
                <article
                    v-for="app in apps"
                    :key="app.clientId"
                    class="profile-apps__card"
                    :aria-label="app.name"
                >
                    <h3>{{ app.name }}</h3>
                    <p class="profile-apps__id">{{ app.clientId }}</p>
                    <dl>
                        <dt>{{ t('oauth.authorized_apps.scopes') }}</dt>
                        <dd>
                            <ul class="profile-apps__scopes">
                                <li v-for="scope in app.scopes" :key="scope">
                                    {{ t(`oauth.scopes.${scope.replace(':', '_')}`) }}
                                </li>
                            </ul>
                        </dd>
                        <dt>{{ t('oauth.authorized_apps.authorized_at') }}</dt>
                        <dd>{{ formatCSTTime(app.latestAuthorizedAt, { withTimezone: true }) }}</dd>
                    </dl>
                    <p class="profile-apps__meta">
                        {{
                            t('oauth.authorized_apps.access_tokens', {
                                count: app.accessTokenCount
                            })
                        }}
                    </p>
                    <p class="profile-apps__meta">
                        {{
                            t('oauth.authorized_apps.refresh_tokens', {
                                count: app.refreshTokenCount
                            })
                        }}
                    </p>
                    <p class="profile-apps__meta">
                        {{
                            t('profile.workbench.pending_codes', {
                                count: app.pendingAuthorizationCodeCount
                            })
                        }}
                    </p>
                    <el-button
                        type="danger"
                        plain
                        :loading="pendingClientId === app.clientId"
                        :disabled="busy"
                        :aria-label="t('profile.workbench.revoke_named', { name: app.name })"
                        @click="confirmRevoke(app, $event)"
                        >{{ t('oauth.authorized_apps.revoke') }}</el-button
                    >
                </article>
            </div>
        </AppAsyncState>
    </section>
</template>

<script setup lang="ts">
import { AppWindow } from 'lucide-vue-next';
import { getCurrentInstance } from 'vue';
import { ElMessageBox } from 'element-plus';
import type { AuthorizedApp } from '~/types/api';
import { formatCSTTime } from '~/utils/time';
import { useProfileTaskGuard } from './profile-workbench';

const { t } = useI18n();
const messageBoxContext = getCurrentInstance()?.appContext;
const { apps, status, error, load, revoke, pendingClientId, mutationError } = useAuthorizedApps();
const confirming = ref(false);
const busy = computed(() => confirming.value || !!pendingClientId.value);
const notice = ref('');
const heading = ref<HTMLElement>();
const errorElement = ref<HTMLElement>();
useProfileTaskGuard({ pending: () => busy.value });
async function reload(force = false) {
    try {
        await load(force);
    } catch {
        /* AppAsyncState retains the read error and retry. */
    }
}
onMounted(() => {
    void reload();
});
async function confirmRevoke(app: AuthorizedApp, event: Event) {
    if (busy.value) return;
    const trigger = event.currentTarget as HTMLElement;
    confirming.value = true;
    notice.value = '';
    try {
        await ElMessageBox.confirm(
            `${app.name}\n${t('oauth.authorized_apps.revoke_confirm')}`,
            t('profile.workbench.revoke_named', { name: app.name }),
            {
                type: 'warning',
                confirmButtonText: t('oauth.authorized_apps.revoke'),
                cancelButtonText: t('common.cancel')
            },
            messageBoxContext
        );
        if (await revoke(app.clientId)) notice.value = t('oauth.authorized_apps.revoke_success');
    } catch (cause) {
        if (cause !== 'cancel' && cause !== 'close') {
            await nextTick();
            errorElement.value?.focus();
        }
    } finally {
        confirming.value = false;
        await nextTick();
        if (trigger.isConnected) trigger.focus();
        else heading.value?.focus();
    }
}
</script>

<style scoped lang="scss">
.profile-apps {
    min-width: 0;
    &__intro {
        color: var(--text-secondary);
        margin: var(--space-2) 0 var(--space-5);
    }
    &__error {
        color: var(--el-color-danger);
        margin-bottom: var(--space-4);
        overflow-wrap: anywhere;
    }
    &__notice {
        margin-bottom: var(--space-4);
    }
    &__table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
    }
    &__table th,
    &__table td {
        padding: var(--space-4) var(--space-3);
        border-bottom: 1px solid var(--border-color);
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
    }
    &__table thead th {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        font-weight: 600;
    }
    &__table th:first-child {
        width: 36%;
        padding-left: 0;
    }
    &__table th:last-child {
        width: 28%;
    }
    &__table tbody th {
        font-weight: 400;
    }
    &__id {
        font-family: var(--font-code);
        color: var(--text-secondary);
        font-size: var(--font-size-meta);
        overflow-wrap: anywhere;
        margin: var(--space-1) 0 var(--space-3);
    }
    &__meta {
        color: var(--text-secondary);
        font-size: var(--font-size-meta);
        margin: var(--space-1) 0;
    }
    &__scopes {
        margin: 0;
        padding-left: var(--space-4);
        font-size: var(--font-size-control);
    }
    &__scopes li + li {
        margin-top: var(--space-2);
    }
    &__action-cell :deep(.el-button) {
        max-width: 100%;
        height: auto;
        min-height: 44px;
        white-space: normal;
    }
    &__cards {
        display: none;
    }
    @media (max-width: 767px) {
        &__table {
            display: none;
        }
        &__cards {
            display: grid;
        }
        &__card {
            padding: var(--space-5) 0;
            border-top: 1px solid var(--border-color);
            overflow-wrap: anywhere;
        }
        &__card:first-child {
            padding-top: 0;
            border-top: 0;
        }
        &__card dl {
            margin: var(--space-4) 0;
        }
        &__card dt {
            color: var(--text-secondary);
            font-size: var(--font-size-control);
            margin-top: var(--space-3);
        }
        &__card dd {
            margin: var(--space-1) 0 0;
        }
        &__card :deep(.el-button) {
            margin-top: var(--space-4);
        }
    }
}
</style>
