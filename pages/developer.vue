<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.develop')"
            :title="t('common.nav.developer')"
            :description="t('developer.description')"
        >
            <template #actions>
                <el-button type="primary" :disabled="!hydrated" @click="openCreate">
                    {{ t('developer.newClient') }}
                </el-button>
            </template>
        </CpPageHeader>

        <div class="cp-stack">
            <CpSheet :title="t('developer.clientsTitle')" flush>
                <CpDataState
                    :pending="pending"
                    :error="error ? describe(error) : null"
                    :empty="!clients?.length"
                    :empty-text="t('developer.empty')"
                    @retry="refresh"
                >
                    <ul class="cp-rows">
                        <li
                            v-for="client in clients"
                            :key="client.id"
                            class="developer__row"
                            :class="{ 'is-selected': client.id === selected?.id }"
                        >
                            <div class="cp-rows__main">
                                <button
                                    type="button"
                                    class="developer__name"
                                    @click="selectedId = client.id"
                                >
                                    {{ client.name }}
                                </button>
                                <CpCode :value="client.clientId" />
                                <span class="cp-rows__meta cp-mono">
                                    {{ client.redirectUris[0] }}
                                    <template v-if="client.redirectUris.length > 1">
                                        {{
                                            t('developer.moreUris', {
                                                n: client.redirectUris.length - 1
                                            })
                                        }}
                                    </template>
                                </span>
                            </div>
                            <div class="developer__facts">
                                <CpStatus
                                    :tone="client.requireEmailVerified ? 'accent' : 'info'"
                                    :label="
                                        client.requireEmailVerified
                                            ? t('developer.verifiedOnly')
                                            : t('developer.anyEmail')
                                    "
                                />
                                <span class="cp-rows__meta">
                                    {{ t('developer.created', { date: date(client.createdAt) }) }}
                                </span>
                            </div>
                            <div class="cp-rows__end">
                                <el-button size="small" @click="openEdit(client)">
                                    {{ t('common.actions.edit') }}
                                </el-button>
                                <el-button
                                    type="danger"
                                    plain
                                    size="small"
                                    :loading="deleting === client.id"
                                    @click="remove(client)"
                                >
                                    {{ t('common.actions.delete') }}
                                </el-button>
                            </div>
                        </li>
                    </ul>
                </CpDataState>
            </CpSheet>

            <CpSheet
                :title="t('developer.reference.title')"
                :description="t('developer.reference.text')"
            >
                <CpDataState
                    :pending="discoveryPending"
                    :error="discoveryError ? describe(discoveryError) : null"
                    @retry="refreshDiscovery"
                >
                    <dl v-if="discovery">
                        <CpField
                            v-for="endpoint in endpoints"
                            :key="endpoint.label"
                            :label="endpoint.label"
                        >
                            <CpCode :value="endpoint.value" />
                        </CpField>
                        <CpField :label="t('developer.reference.pkce')" mono>
                            {{ discovery.code_challenge_methods_supported.join(', ') }}
                        </CpField>
                        <CpField :label="t('developer.reference.clientAuth')" mono>
                            {{ discovery.token_endpoint_auth_methods_supported.join(', ') }}
                        </CpField>
                        <CpField :label="t('developer.reference.lifetimes')">
                            {{ t('developer.reference.lifetimesValue') }}
                        </CpField>
                        <CpField :label="t('developer.reference.scopes')">
                            <ul class="developer__scopes">
                                <li v-for="scope in discovery.scopes_supported" :key="scope">
                                    <code class="cp-mono">{{ scope }}</code>
                                    <span class="cp-muted">{{ scopeText.title(scope) }}</span>
                                </li>
                            </ul>
                        </CpField>
                    </dl>
                </CpDataState>
            </CpSheet>

            <CpSheet
                v-if="selected && discovery"
                :title="t('developer.example.title')"
                :description="t('developer.example.text', { name: selected.name })"
            >
                <div class="developer__example">
                    <p class="developer__label">{{ t('developer.example.authorize') }}</p>
                    <CpCode :value="exampleUrl" block />
                    <p class="cp-help">{{ t('developer.example.placeholders') }}</p>
                    <p class="developer__label">{{ t('developer.example.exchange') }}</p>
                    <CpCode :value="exampleExchange" block />
                </div>
            </CpSheet>
        </div>

        <DeveloperClientDialog
            :open="dialog.open"
            :client="dialog.client"
            @close="dialog.open = false"
            @saved="onSaved"
        />

        <el-dialog
            :model-value="secret !== null"
            :title="t('developer.secret.title')"
            width="min(520px, calc(100vw - 32px))"
            append-to-body
            :show-close="false"
            :close-on-click-modal="false"
            :close-on-press-escape="false"
        >
            <div v-if="secret" class="developer__secret">
                <CpNote tone="warning">{{ t('developer.secret.warning') }}</CpNote>
                <dl>
                    <CpField :label="t('developer.secret.clientId')">
                        <CpCode :value="secret.clientId" />
                    </CpField>
                    <CpField :label="t('developer.secret.clientSecret')">
                        <CpCode :value="secret.value" secret />
                    </CpField>
                </dl>
            </div>
            <template #footer>
                <el-button type="primary" @click="secret = null">{{
                    t('developer.secret.stored')
                }}</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import type { OAuthClient } from '~/types/api';

interface DiscoveryDocument {
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    revocation_endpoint: string;
    scopes_supported: string[];
    code_challenge_methods_supported: string[];
    token_endpoint_auth_methods_supported: string[];
}

definePageMeta({ middleware: 'auth' });

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();
const { date } = useFormat();
const hydrated = useHydrated();
const scopeText = useScopeText();

useHead({ title: t('common.nav.developer') });

const [clientsResult, discoveryResult] = await Promise.all([
    useAsyncData('developer-clients', () => api<OAuthClient[]>('/api/oauth/clients')),
    useAsyncData('developer-discovery', () =>
        api<DiscoveryDocument>('/.well-known/openid-configuration')
    )
]);
const { data: clients, pending, error, refresh } = clientsResult;
const {
    data: discovery,
    pending: discoveryPending,
    error: discoveryError,
    refresh: refreshDiscovery
} = discoveryResult;

const selectedId = ref<string | null>(null);
const selected = computed(
    () =>
        clients.value?.find(client => client.id === selectedId.value) ?? clients.value?.[0] ?? null
);

const endpoints = computed(() =>
    discovery.value
        ? [
              {
                  label: t('developer.reference.authorization'),
                  value: discovery.value.authorization_endpoint
              },
              { label: t('developer.reference.token'), value: discovery.value.token_endpoint },
              {
                  label: t('developer.reference.userinfo'),
                  value: discovery.value.userinfo_endpoint
              },
              {
                  label: t('developer.reference.revocation'),
                  value: discovery.value.revocation_endpoint
              }
          ]
        : []
);

const exampleUrl = computed(() => {
    if (!selected.value || !discovery.value) return '';
    const query = new URLSearchParams({
        response_type: 'code',
        client_id: selected.value.clientId,
        redirect_uri: selected.value.redirectUris[0] ?? '',
        scope: 'openid profile',
        state: 'STATE',
        code_challenge: 'CODE_CHALLENGE',
        code_challenge_method: 'S256'
    });
    return `${discovery.value.authorization_endpoint}?${query}`;
});

const exampleExchange = computed(() => {
    if (!selected.value || !discovery.value) return '';
    const form = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: selected.value.clientId,
        code: 'CODE',
        redirect_uri: selected.value.redirectUris[0] ?? '',
        code_verifier: 'CODE_VERIFIER'
    });
    return `POST ${discovery.value.token_endpoint}\nContent-Type: application/x-www-form-urlencoded\n\n${form}`;
});

/* Create / edit */
const dialog = reactive<{ open: boolean; client: OAuthClient | null }>({
    open: false,
    client: null
});
const secret = ref<{ clientId: string; value: string } | null>(null);

function openCreate() {
    dialog.client = null;
    dialog.open = true;
}

function openEdit(client: OAuthClient) {
    dialog.client = client;
    dialog.open = true;
}

async function onSaved(client: OAuthClient & { clientSecret?: string }) {
    const created = !dialog.client;
    dialog.open = false;
    if (created && client.clientSecret) {
        secret.value = { clientId: client.clientId, value: client.clientSecret };
        selectedId.value = client.id;
    } else {
        ElMessage.success(t('common.states.saved'));
    }
    await refresh();
}

/* Delete */
const deleting = ref<string | null>(null);

async function remove(client: OAuthClient) {
    try {
        await ElMessageBox.confirm(
            t('developer.deleteConfirm', { name: client.name }),
            t('developer.deleteTitle'),
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
    deleting.value = client.id;
    try {
        await api(`/api/oauth/clients/${encodeURIComponent(client.id)}`, { method: 'DELETE' });
        if (selectedId.value === client.id) selectedId.value = null;
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
.developer__row {
    align-items: flex-start;

    &.is-selected {
        box-shadow: inset 2px 0 0 var(--cp-accent);
    }
}

.developer__name {
    padding: 0;
    font: inherit;
    font-weight: var(--cp-weight-medium);
    text-align: left;
    color: var(--cp-text);
    background: none;
    border: 0;
    cursor: pointer;

    &:hover {
        color: var(--cp-accent);
    }
}

.developer__facts {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--cp-space-1);
}

.developer__scopes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--cp-space-1) var(--cp-space-4);

    li {
        display: flex;
        gap: var(--cp-space-2);
        font-size: var(--cp-text-sm);
    }
}

.developer__example {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-2);
}

.developer__label {
    margin-top: var(--cp-space-2);
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text);

    &:first-child {
        margin-top: 0;
    }
}

.developer__secret {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

@media (max-width: 767px) {
    .developer__facts {
        align-items: flex-start;
    }
}
</style>
