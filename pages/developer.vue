<template>
    <div class="developer">
        <AppPageHeader :title="$t('developer.title')" :description="$t('developer.subtitle')">
            <template #actions>
                <el-button
                    ref="registerButton"
                    type="primary"
                    native-type="button"
                    :disabled="
                        pending || formPending || secretVisible || authStatus === 'anonymous'
                    "
                    @click="openCreate"
                >
                    <Plus :size="18" aria-hidden="true" />
                    {{ $t('developer.register_app') }}
                </el-button>
            </template>
        </AppPageHeader>

        <p class="developer__notice" role="status" aria-live="polite">{{ notice }}</p>
        <p v-if="actionError" class="developer__notice" role="alert">{{ actionError }}</p>
        <NuxtLink v-if="authStatus === 'anonymous'" :to="loginPath" class="developer__help-link">
            {{ $t('nav.login') }}
        </NuxtLink>

        <section class="developer__applications" aria-labelledby="developer-applications-title">
            <h2 id="developer-applications-title">{{ $t('developer.your_apps') }}</h2>
            <AppAsyncState
                :pending="pending"
                :error="loadError"
                :empty="clients.length === 0"
                :empty-text="$t('developer.no_apps')"
                @retry="refresh()"
            >
                <template #empty>
                    <p>{{ $t('developer.no_apps') }}</p>
                    <el-button native-type="button" @click="openCreate">
                        {{ $t('developer.register_app') }}
                    </el-button>
                </template>

                <table class="developer__table">
                    <thead>
                        <tr>
                            <th scope="col">{{ $t('developer.app_name') }}</th>
                            <th scope="col">{{ $t('developer.redirect_uris') }}</th>
                            <th scope="col">{{ $t('developer.actions') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="client in clients"
                            :key="client.id"
                            :aria-busy="rowPending(client.id)"
                        >
                            <td>
                                <p
                                    :id="`developer-table-name-${client.id}`"
                                    class="developer__client-name"
                                >
                                    {{ client.name }}
                                </p>
                                <div class="developer__client-id">
                                    <span class="sr-only">{{ $t('developer.client_id') }}: </span>
                                    <code>{{ client.clientId }}</code>
                                    <el-button
                                        native-type="button"
                                        plain
                                        :disabled="rowPending(client.id) || !!copyingId"
                                        :loading="copyingId === client.id"
                                        :aria-label="
                                            $t('developer.copy_client_id') + ': ' + client.name
                                        "
                                        @click="copyClientId(client)"
                                    >
                                        <Copy :size="18" aria-hidden="true" />
                                    </el-button>
                                </div>
                                <p class="developer__email-policy">
                                    {{
                                        $t(
                                            client.requireEmailVerified
                                                ? 'developer.email_verified_required'
                                                : 'developer.email_not_required'
                                        )
                                    }}
                                </p>
                            </td>
                            <td>
                                <ul class="developer__uris">
                                    <li v-for="uri in client.redirectUris" :key="uri">
                                        <code>{{ uri }}</code>
                                        <p
                                            v-if="!isSafeOAuthRedirectUri(uri)"
                                            class="developer__unsafe"
                                        >
                                            {{ $t('developer.unsafe_callback') }}
                                        </p>
                                    </li>
                                </ul>
                            </td>
                            <td>
                                <div class="developer__row-actions">
                                    <el-button
                                        native-type="button"
                                        :disabled="rowPending(client.id)"
                                        :aria-label="$t('developer.edit') + ': ' + client.name"
                                        @click="openEdit(client, $event)"
                                    >
                                        {{ $t('developer.edit') }}
                                    </el-button>
                                    <el-button
                                        type="danger"
                                        plain
                                        native-type="button"
                                        :disabled="rowPending(client.id)"
                                        :loading="deletingId === client.id"
                                        :aria-label="$t('developer.delete') + ': ' + client.name"
                                        @click="openDelete(client, $event)"
                                    >
                                        {{ $t('developer.delete') }}
                                    </el-button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <ul class="developer__mobile-list">
                    <li
                        v-for="client in clients"
                        :key="client.id"
                        class="developer__mobile-client"
                        :aria-busy="rowPending(client.id)"
                    >
                        <h3 class="developer__client-name">{{ client.name }}</h3>
                        <div class="developer__client-id">
                            <span class="sr-only">{{ $t('developer.client_id') }}: </span>
                            <code>{{ client.clientId }}</code>
                            <el-button
                                native-type="button"
                                plain
                                :disabled="rowPending(client.id) || !!copyingId"
                                :loading="copyingId === client.id"
                                :aria-label="$t('developer.copy_client_id') + ': ' + client.name"
                                @click="copyClientId(client)"
                            >
                                <Copy :size="18" aria-hidden="true" />
                            </el-button>
                        </div>
                        <p class="developer__email-policy">
                            {{
                                $t(
                                    client.requireEmailVerified
                                        ? 'developer.email_verified_required'
                                        : 'developer.email_not_required'
                                )
                            }}
                        </p>
                        <p class="developer__meta-label">{{ $t('developer.redirect_uris') }}</p>
                        <ul class="developer__uris">
                            <li v-for="uri in client.redirectUris" :key="uri">
                                <code>{{ uri }}</code>
                                <p v-if="!isSafeOAuthRedirectUri(uri)" class="developer__unsafe">
                                    {{ $t('developer.unsafe_callback') }}
                                </p>
                            </li>
                        </ul>
                        <div class="developer__row-actions">
                            <el-button
                                native-type="button"
                                :disabled="rowPending(client.id)"
                                :aria-label="$t('developer.edit') + ': ' + client.name"
                                @click="openEdit(client, $event)"
                            >
                                {{ $t('developer.edit') }}
                            </el-button>
                            <el-button
                                type="danger"
                                plain
                                native-type="button"
                                :disabled="rowPending(client.id)"
                                :loading="deletingId === client.id"
                                :aria-label="$t('developer.delete') + ': ' + client.name"
                                @click="openDelete(client, $event)"
                            >
                                {{ $t('developer.delete') }}
                            </el-button>
                        </div>
                    </li>
                </ul>
            </AppAsyncState>
        </section>

        <section class="developer__help" aria-labelledby="developer-guide-title">
            <h2 id="developer-guide-title">{{ $t('developer.integration_guide') }}</h2>
            <p>{{ $t('developer.integration_hint') }}</p>
            <NuxtLink to="/about" class="developer__help-link">
                {{ $t('developer.open_guide') }}
                <ArrowUpRight :size="18" aria-hidden="true" />
            </NuxtLink>
        </section>

        <el-dialog
            v-model="formVisible"
            :title="$t(formMode === 'create' ? 'developer.register_app' : 'developer.edit_app')"
            width="min(680px, calc(100vw - 32px))"
            :close-on-click-modal="false"
            :close-on-press-escape="!formPending"
            :show-close="!formPending"
            :before-close="beforeFormClose"
            destroy-on-close
            @opened="clientForm?.focusFirstField()"
            @closed="formClosed"
        >
            <p v-if="saveError" class="developer__dialog-error" role="alert">{{ saveError }}</p>
            <OAuthClientForm
                ref="clientForm"
                :initial="formInitial"
                :submit-label="
                    $t(
                        formMode === 'create'
                            ? formPending
                                ? 'developer.creating'
                                : 'developer.create'
                            : formPending
                              ? 'developer.saving'
                              : 'developer.save'
                    )
                "
                :pending="formPending"
                @submit="saveClient"
                @cancel="formVisible = false"
            />
        </el-dialog>

        <OAuthClientSecretDialog
            v-model="secretVisible"
            :secret="newSecret"
            @closed="secretClosed"
        />

        <el-dialog
            v-model="deleteVisible"
            :title="$t('developer.delete_application')"
            width="min(480px, calc(100vw - 32px))"
            :close-on-click-modal="false"
            :close-on-press-escape="!deletingId"
            :show-close="!deletingId"
            :before-close="beforeDeleteClose"
            destroy-on-close
            @closed="deleteClosed"
        >
            <template v-if="deleteTarget">
                <p class="developer__delete-target">
                    {{ $t('developer.delete_target', { name: deleteTarget.name }) }}
                </p>
                <p>{{ $t('developer.delete_impact') }}</p>
                <p v-if="deleteError" class="developer__dialog-error" role="alert">
                    {{ deleteError }}
                </p>
            </template>
            <template #footer>
                <div class="developer__dialog-actions">
                    <el-button
                        native-type="button"
                        :disabled="!!deletingId"
                        @click="deleteVisible = false"
                    >
                        {{ $t('developer.cancel') }}
                    </el-button>
                    <el-button
                        type="danger"
                        native-type="button"
                        :disabled="!!deletingId"
                        :loading="!!deletingId"
                        @click="deleteClient"
                    >
                        {{ $t('developer.delete') }}
                    </el-button>
                </div>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { ArrowUpRight, Copy, Plus } from 'lucide-vue-next';
import OAuthClientForm from '~/components/developer/OAuthClientForm.vue';
import OAuthClientSecretDialog from '~/components/developer/OAuthClientSecretDialog.vue';
import type { OAuthClient, OAuthClientDraft } from '~/types/api';
import { buildLoginPath, getSafeRedirectTarget } from '~/utils/auth-redirect';
import { isSafeOAuthRedirectUri } from '~/utils/oauth-redirect';

definePageMeta({ middleware: 'auth' });
const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { user, status: authStatus } = useAuth();
useHead({ title: () => `${t('developer.title')} - CP OAuth` });
const loginPath = computed(() => buildLoginPath(getSafeRedirectTarget(route.fullPath)));

type RequestFailure = {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
    data?: {
        message?: string;
        fields?: Record<string, string>;
        data?: { fields?: Record<string, string> };
    };
};

function errorMessage(cause: unknown, fallback: string) {
    const failure = cause as RequestFailure | null;
    const code = failure?.response?.status ?? failure?.statusCode ?? failure?.status;
    if (code === 401) return t('developer.session_expired');
    if (code === 403) return t('identity.permission_denied');
    if (code && code >= 500) return t('identity.network_error');
    return failure?.data?.message || fallback;
}

const {
    data: clients,
    pending,
    error: clientsError,
    refresh
} = await useAsyncData(
    `developer:clients:${user.value?.id ?? 'unavailable'}`,
    () => api<OAuthClient[]>('/api/oauth/clients'),
    { default: () => [], deep: false }
);
const loadError = computed(() =>
    clientsError.value ? errorMessage(clientsError.value, t('identity.network_error')) : null
);
const notice = ref('');
const actionError = ref('');
const copyingId = ref<string | null>(null);
const registerButton = ref<{ $el: HTMLButtonElement } | null>(null);
const clientForm = ref<InstanceType<typeof OAuthClientForm> | null>(null);
const formVisible = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formPending = ref(false);
const editingId = ref<string | null>(null);
const formInitial = ref<OAuthClientDraft>({
    name: '',
    redirectUris: [''],
    requireEmailVerified: false
});
const saveError = ref('');
let formTrigger: HTMLElement | null = null;
const newSecret = ref<{ clientId: string; clientSecret: string } | null>(null);
const secretVisible = ref(false);
const deleteVisible = ref(false);
const deleteTarget = ref<OAuthClient | null>(null);
const deletingId = ref<string | null>(null);
const deleteError = ref('');
let deleteTrigger: HTMLElement | null = null;

function triggerFrom(event?: MouseEvent) {
    return event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
}

async function restoreFocus(trigger: HTMLElement | null) {
    await nextTick();
    if (
        trigger?.isConnected &&
        trigger.getClientRects().length &&
        !trigger.hasAttribute('disabled')
    ) {
        trigger.focus();
    } else {
        registerButton.value?.$el?.focus();
    }
}

function rowPending(id: string) {
    return deletingId.value === id || (formPending.value && editingId.value === id);
}

function openCreate(event?: MouseEvent) {
    if (formPending.value || pending.value || authStatus.value === 'anonymous') return;
    formTrigger = triggerFrom(event);
    formMode.value = 'create';
    editingId.value = null;
    formInitial.value = { name: '', redirectUris: [''], requireEmailVerified: false };
    saveError.value = '';
    formVisible.value = true;
}

function openEdit(client: OAuthClient, event: MouseEvent) {
    if (rowPending(client.id)) return;
    formTrigger = triggerFrom(event);
    formMode.value = 'edit';
    editingId.value = client.id;
    formInitial.value = {
        name: client.name,
        redirectUris: [...client.redirectUris],
        requireEmailVerified: client.requireEmailVerified
    };
    saveError.value = '';
    formVisible.value = true;
}

function beforeFormClose(done: () => void) {
    if (!formPending.value) done();
}

async function saveClient(draft: OAuthClientDraft) {
    if (formPending.value) return;
    formPending.value = true;
    saveError.value = '';
    notice.value = '';
    try {
        if (formMode.value === 'create') {
            const result = await api<OAuthClient & { clientSecret: string }>('/api/oauth/clients', {
                method: 'POST',
                body: draft
            });
            const { clientSecret, ...client } = result;
            clients.value = [client, ...clients.value];
            newSecret.value = { clientId: client.clientId, clientSecret };
            notice.value = t('developer.created');
        } else if (editingId.value) {
            const client = await api<OAuthClient>(
                `/api/oauth/clients/${encodeURIComponent(editingId.value)}`,
                {
                    method: 'PATCH',
                    body: draft
                }
            );
            clients.value = clients.value.map(current =>
                current.id === client.id ? client : current
            );
            notice.value = t('developer.updated');
        }
        formVisible.value = false;
    } catch (cause) {
        const failure = cause as RequestFailure;
        const fields = failure.data?.data?.fields ?? failure.data?.fields;
        if (fields) {
            clientForm.value?.setFieldErrors(fields);
            saveError.value = t('developer.form_invalid');
        } else {
            saveError.value = errorMessage(
                cause,
                t(formMode.value === 'create' ? 'developer.create_error' : 'developer.update_error')
            );
        }
    } finally {
        formPending.value = false;
    }
}

async function formClosed() {
    editingId.value = null;
    formInitial.value = { name: '', redirectUris: [''], requireEmailVerified: false };
    saveError.value = '';
    if (newSecret.value) {
        await nextTick();
        secretVisible.value = true;
    } else {
        await restoreFocus(formTrigger);
        formTrigger = null;
    }
}

async function secretClosed() {
    newSecret.value = null;
    await restoreFocus(formTrigger);
    formTrigger = null;
}

function openDelete(client: OAuthClient, event: MouseEvent) {
    if (rowPending(client.id)) return;
    deleteTarget.value = client;
    deleteTrigger = triggerFrom(event);
    deleteError.value = '';
    deleteVisible.value = true;
}

function beforeDeleteClose(done: () => void) {
    if (!deletingId.value) done();
}

async function deleteClient() {
    const client = deleteTarget.value;
    if (!client || deletingId.value) return;
    deletingId.value = client.id;
    deleteError.value = '';
    notice.value = '';
    try {
        await api(`/api/oauth/clients/${encodeURIComponent(client.id)}`, { method: 'DELETE' });
        clients.value = clients.value.filter(current => current.id !== client.id);
        notice.value = t('developer.deleted', { name: client.name });
        deleteVisible.value = false;
    } catch (cause) {
        deleteError.value = errorMessage(cause, t('developer.delete_error'));
    } finally {
        deletingId.value = null;
    }
}

async function deleteClosed() {
    deleteTarget.value = null;
    deleteError.value = '';
    await restoreFocus(deleteTrigger);
    deleteTrigger = null;
}

async function copyClientId(client: OAuthClient) {
    if (copyingId.value) return;
    copyingId.value = client.id;
    actionError.value = '';
    notice.value = '';
    try {
        await navigator.clipboard.writeText(client.clientId);
        notice.value = t('developer.copy_success');
    } catch {
        actionError.value = t('developer.copy_error');
    } finally {
        copyingId.value = null;
    }
}
</script>

<style scoped lang="scss">
.developer {
    min-width: 0;

    h2 {
        margin-bottom: var(--space-4);
        font-size: 20px;
        line-height: 1.4;
    }

    &__notice {
        margin-bottom: var(--space-4);
        color: var(--text-primary);
        overflow-wrap: anywhere;
    }

    &__notice:empty {
        display: none;
    }

    &__table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        background: var(--card-bg);
    }

    th,
    td {
        padding: var(--space-4);
        border-bottom: 1px solid var(--border-color);
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
    }

    th {
        color: var(--text-secondary);
        font-size: 14px;
        font-weight: 600;
    }

    th:first-child {
        width: 31%;
    }

    th:last-child {
        width: 164px;
    }

    &__client-name {
        margin: 0;
        color: var(--text-primary);
        font-size: 16px;
        font-weight: 600;
        overflow-wrap: anywhere;
    }

    &__client-id {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-top: var(--space-2);
        min-width: 0;

        code {
            min-width: 0;
            flex: 1;
        }

        :deep(.el-button) {
            flex-shrink: 0;
            min-width: 44px;
            padding: 0;
        }
    }

    code {
        font-family: monospace;
        font-size: 14px;
        line-height: 1.5;
        color: var(--text-secondary);
        overflow-wrap: anywhere;
        white-space: normal;
    }

    &__email-policy {
        margin-top: var(--space-2);
        font-size: 14px;
        color: var(--text-secondary);
    }

    &__uris {
        display: grid;
        gap: var(--space-3);
        min-width: 0;
        padding: 0;
        margin: 0;
        list-style: none;
    }

    &__unsafe {
        margin-top: var(--space-2);
        padding-left: var(--space-3);
        border-left: 2px solid var(--el-color-warning);
        color: var(--text-primary);
        font-size: 14px;
        line-height: 1.5;
    }

    &__row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }

    &__row-actions :deep(.el-button),
    &__dialog-actions :deep(.el-button) {
        margin: 0;
    }

    &__mobile-list {
        display: none;
        list-style: none;
        margin: 0;
        padding: 0;
    }

    &__mobile-client {
        min-width: 0;
        padding: var(--space-4);
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: var(--card-radius);
    }

    &__meta-label {
        margin: var(--space-4) 0 var(--space-2);
        font-size: 14px;
        font-weight: 600;
    }

    &__help {
        margin-top: var(--space-6);
        padding-top: var(--space-5);
        border-top: 1px solid var(--border-color);
        color: var(--text-secondary);
    }

    &__help-link {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        min-height: 44px;
        margin-top: var(--space-2);
        color: var(--accent);
        text-decoration: underline;
        overflow-wrap: anywhere;
    }

    &__dialog-error {
        margin: var(--space-3) 0 var(--space-4);
        color: var(--text-primary);
        overflow-wrap: anywhere;
    }

    &__delete-target {
        margin-bottom: var(--space-3);
        font-weight: 600;
        overflow-wrap: anywhere;
    }

    &__dialog-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--space-2);
    }

    @media (max-width: 767px) {
        &__table {
            display: none;
        }

        &__mobile-list {
            display: grid;
            gap: var(--space-4);
        }

        &__row-actions {
            margin-top: var(--space-4);
        }

        &__row-actions :deep(.el-button) {
            flex: 1;
        }
    }
}
</style>
