<template>
    <section ref="root" class="profile-bindings" aria-labelledby="profile-bindings-title">
        <header class="profile-bindings__header">
            <div>
                <h2 id="profile-bindings-title">{{ t('binding.title') }}</h2>
                <p class="profile-bindings__hint">{{ t('binding.workbench.description') }}</p>
            </div>
            <el-button
                native-type="button"
                data-bind-reload
                :disabled="controlsLocked || status === 'pending'"
                @click="reload"
            >
                <RefreshCw :size="16" aria-hidden="true" />
                {{ t('binding.workbench.reload') }}
            </el-button>
        </header>

        <p v-if="success || notice" class="profile-bindings__notice" role="status">
            {{ success || notice }}
        </p>
        <p v-if="confirmationError" class="profile-bindings__error" role="alert">
            {{ confirmationError }}
        </p>
        <div v-if="identityError" class="profile-bindings__identity-error" role="alert">
            <p>{{ identityError }}</p>
            <el-button
                native-type="button"
                :disabled="controlsLocked"
                :loading="identityPending"
                @click="binding.refreshIdentity()"
            >
                {{ t('common.retry') }}
            </el-button>
        </div>

        <AppAsyncState
            :pending="status === 'idle' || status === 'pending'"
            :error="error"
            @retry="reload"
        >
            <div class="profile-bindings__section">
                <h3>{{ t('binding.workbench.bound_accounts') }}</h3>
                <p v-if="bindings.length === 0" class="profile-bindings__hint">
                    {{ t('binding.no_accounts') }}
                </p>
                <table v-else class="profile-bindings__table" role="table">
                    <caption class="sr-only">
                        {{
                            t('binding.workbench.bound_accounts')
                        }}
                    </caption>
                    <thead role="rowgroup">
                        <tr role="row">
                            <th scope="col" role="columnheader">{{ t('binding.platform') }}</th>
                            <th scope="col" role="columnheader">
                                {{ t('binding.workbench.account_identity') }}
                            </th>
                            <th scope="col" role="columnheader">
                                {{ t('profile.workbench.actions') }}
                            </th>
                        </tr>
                    </thead>
                    <tbody role="rowgroup">
                        <tr
                            v-for="account in bindings"
                            :key="account.id"
                            role="row"
                            :aria-busy="pendingPlatform === account.platform"
                        >
                            <td role="cell">
                                <div class="profile-bindings__platform">
                                    <AppPlatformIcon :platform="account.platform" />
                                    <strong>{{ platformName(account.platform) }}</strong>
                                </div>
                                <span class="profile-bindings__status">
                                    {{ t('binding.workbench.bound') }}
                                </span>
                            </td>
                            <td role="cell">
                                <span class="profile-bindings__account">
                                    {{ account.platformUsername || account.platformUid }}
                                </span>
                                <span v-if="account.platformUsername" class="profile-bindings__uid">
                                    {{ t('binding.platform_uid') }}: {{ account.platformUid }}
                                </span>
                                <p
                                    v-if="mutationErrors[account.platform]"
                                    :id="`profile-bindings-error-${account.platform}`"
                                    class="profile-bindings__error"
                                    role="alert"
                                >
                                    {{ mutationErrors[account.platform] }}
                                </p>
                                <p
                                    v-if="cooldownMinutes(account.platform)"
                                    :id="`profile-bindings-cooldown-${account.platform}`"
                                    class="profile-bindings__hint"
                                    role="status"
                                >
                                    {{
                                        t('binding.workbench.refresh_cooldown_minutes', {
                                            minutes: cooldownMinutes(account.platform)
                                        })
                                    }}
                                </p>
                            </td>
                            <td role="cell">
                                <div class="profile-bindings__actions">
                                    <el-button
                                        v-if="PLATFORMS[account.platform].refreshable"
                                        native-type="button"
                                        :aria-label="
                                            t('binding.workbench.refresh_named', {
                                                platform: platformName(account.platform),
                                                account:
                                                    account.platformUsername || account.platformUid
                                            })
                                        "
                                        :aria-describedby="
                                            [
                                                mutationErrors[account.platform]
                                                    ? `profile-bindings-error-${account.platform}`
                                                    : '',
                                                cooldownMinutes(account.platform)
                                                    ? `profile-bindings-cooldown-${account.platform}`
                                                    : ''
                                            ]
                                                .filter(Boolean)
                                                .join(' ') || undefined
                                        "
                                        :loading="
                                            mutation === 'refresh' &&
                                            pendingPlatform === account.platform
                                        "
                                        :disabled="
                                            controlsLocked || cooldownMinutes(account.platform) > 0
                                        "
                                        @click="refreshAccount(account, $event)"
                                    >
                                        <RefreshCw :size="16" aria-hidden="true" />
                                        {{ t('binding.refresh_username') }}
                                    </el-button>
                                    <el-button
                                        native-type="button"
                                        :data-bound-platform="account.platform"
                                        type="danger"
                                        plain
                                        :aria-label="
                                            t('binding.workbench.unlink_named', {
                                                platform: platformName(account.platform),
                                                account:
                                                    account.platformUsername || account.platformUid
                                            })
                                        "
                                        :aria-describedby="
                                            mutationErrors[account.platform]
                                                ? `profile-bindings-error-${account.platform}`
                                                : undefined
                                        "
                                        :disabled="controlsLocked"
                                        :loading="
                                            mutation === 'unlink' &&
                                            pendingPlatform === account.platform
                                        "
                                        @click="unlinkAccount(account, $event)"
                                    >
                                        {{ t('binding.unlink') }}
                                    </el-button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-if="unboundPlatforms.length" class="profile-bindings__section">
                <h3>{{ t('binding.workbench.unbound_accounts') }}</h3>
                <div v-if="configProblem" class="profile-bindings__config-error" role="alert">
                    <p>{{ configProblem }}</p>
                    <el-button
                        native-type="button"
                        :disabled="configLoading"
                        :loading="configLoading"
                        @click="retryConfig"
                    >
                        {{ t('common.retry') }}
                    </el-button>
                </div>
                <ul class="profile-bindings__available">
                    <li v-for="platform in unboundPlatforms" :key="platform">
                        <div class="profile-bindings__available-info">
                            <div class="profile-bindings__platform">
                                <AppPlatformIcon :platform="platform" />
                                <strong>{{ platformName(platform) }}</strong>
                            </div>
                            <span class="profile-bindings__status">
                                {{ t('binding.workbench.unbound') }}
                            </span>
                            <p v-if="!canBind(platform)" class="profile-bindings__hint">
                                {{
                                    configLoading
                                        ? t('binding.workbench.checking_providers')
                                        : configReady
                                          ? t('binding.workbench.provider_disabled', {
                                                platform: platformName(platform)
                                            })
                                          : t('binding.workbench.provider_unknown')
                                }}
                            </p>
                            <p
                                v-if="mutationErrors[platform]"
                                :id="`profile-bindings-error-${platform}`"
                                class="profile-bindings__error"
                                role="alert"
                            >
                                {{ mutationErrors[platform] }}
                            </p>
                        </div>
                        <el-button
                            v-if="canBind(platform)"
                            native-type="button"
                            :data-bind-platform="platform"
                            :aria-label="
                                t('binding.workbench.link_named', {
                                    platform: platformName(platform)
                                })
                            "
                            :aria-describedby="
                                mutationErrors[platform]
                                    ? `profile-bindings-error-${platform}`
                                    : undefined
                            "
                            :disabled="controlsLocked"
                            :loading="mutation === 'oauth' && pendingPlatform === platform"
                            @click="startBinding(platform, $event)"
                        >
                            {{ t('binding.link_account') }}
                        </el-button>
                    </li>
                </ul>
            </div>
        </AppAsyncState>

        <ProfileBindingDialog
            ref="dialog"
            :model-value="dialogVisible"
            :platform="dialogPlatform"
            @update:model-value="setDialogVisible"
            @completed="bindingCompleted"
        />
    </section>
</template>

<script setup lang="ts">
import {
    computed,
    getCurrentInstance,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch
} from 'vue';
import { ElMessageBox } from 'element-plus';
import { RefreshCw } from 'lucide-vue-next';
import { useProfileBindings } from '~/composables/useProfileBindings';
import { usePublicConfig } from '~/composables/usePublicConfig';
import type { LinkedAccount, PublicConfigResponse } from '~/types/api';
import {
    PLATFORMS,
    PLATFORM_NAMES,
    OAUTH_PROVIDERS,
    type OAuthProvider,
    type Platform,
    type VerifiablePlatform
} from '~/utils/platforms';
import ProfileBindingDialog from './ProfileBindingDialog.vue';
import { profileError, useProfileTaskGuard } from './profile-workbench';

const providerConfigFields = {
    github: 'githubLoginEnabled',
    google: 'googleLoginEnabled',
    codeforces: 'codeforcesLoginEnabled',
    clist: 'clistLoginEnabled'
} as const satisfies Record<OAuthProvider, keyof PublicConfigResponse>;
const { t } = useI18n();
const messageBoxContext = getCurrentInstance()?.appContext;
const binding = useProfileBindings();
const {
    bindings,
    status,
    error,
    pending,
    mutation,
    pendingPlatform,
    mutationErrors,
    refreshCooldowns,
    notice,
    identityError,
    identityPending
} = binding;
const publicConfig = usePublicConfig();
const root = ref<HTMLElement | null>(null);
const dialog = ref<InstanceType<typeof ProfileBindingDialog> | null>(null);
const dialogVisible = ref(false);
const dialogPlatform = ref<VerifiablePlatform | null>(null);
const confirmingPlatform = ref<Platform | null>(null);
const confirmationError = ref<string | null>(null);
const success = ref<string | null>(null);
const now = ref(Date.now());
const controlsLocked = computed(
    () =>
        pending.value ||
        status.value === 'pending' ||
        confirmingPlatform.value !== null ||
        dialogVisible.value
);
const unboundPlatforms = computed(() =>
    PLATFORM_NAMES.filter(
        platform => !bindings.value.some(account => account.platform === platform)
    )
);
const configLoading = computed(
    () => publicConfig.status.value === 'pending' || publicConfig.status.value === 'idle'
);
const configReady = computed(
    () =>
        publicConfig.status.value === 'success' &&
        Boolean(publicConfig.data.value) &&
        OAUTH_PROVIDERS.every(
            provider =>
                typeof publicConfig.data.value?.[providerConfigFields[provider]] === 'boolean'
        )
);
const configProblem = computed(() =>
    publicConfig.error.value
        ? profileError(publicConfig.error.value, t('binding.workbench.provider_config_error'))
        : !configLoading.value && !configReady.value
          ? t('binding.workbench.provider_config_error')
          : null
);
let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
let dialogTrigger: HTMLElement | null = null;
let leaving = false;

function platformName(platform: Platform) {
    return t(PLATFORMS[platform].translationKey);
}

function canBind(platform: Platform) {
    if (PLATFORMS[platform].method === 'proof') return true;
    return (
        configReady.value &&
        publicConfig.data.value?.[providerConfigFields[platform as OAuthProvider]] === true
    );
}

function cooldownMinutes(platform: Platform) {
    return Math.max(0, Math.ceil(((refreshCooldowns.value[platform] || 0) - now.value) / 60_000));
}

function scheduleCooldown() {
    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = null;
    now.value = Date.now();
    const deadlines = Object.values(refreshCooldowns.value).filter(
        deadline => deadline > now.value
    );
    if (deadlines.length) {
        cooldownTimer = setTimeout(
            scheduleCooldown,
            Math.min(30_000, Math.min(...deadlines) - now.value)
        );
    }
}

async function reload() {
    try {
        await binding.load(true);
    } catch {
        // The list error remains visible in AppAsyncState, including malformed responses.
    }
}

async function retryConfig() {
    await publicConfig.refresh({ dedupe: 'defer' });
}

async function restoreAction(trigger: HTMLElement | null, platform: Platform) {
    await nextTick();
    if (leaving) return;
    if (trigger?.isConnected && !trigger.hasAttribute('disabled')) {
        trigger.focus();
        return;
    }
    const nearest =
        root.value?.querySelector<HTMLButtonElement>(`[data-bind-platform="${platform}"]`) ||
        root.value?.querySelector<HTMLButtonElement>(`[data-bound-platform="${platform}"]`);
    if (nearest && !nearest.disabled) nearest.focus();
    else root.value?.querySelector<HTMLButtonElement>('[data-bind-reload]')?.focus();
}

async function refreshAccount(account: LinkedAccount, event: Event) {
    if (controlsLocked.value || cooldownMinutes(account.platform) > 0) return;
    const trigger = event.currentTarget as HTMLElement | null;
    success.value = null;
    confirmationError.value = null;
    try {
        if (await binding.refreshOwn(account)) success.value = t('binding.refresh_success');
    } catch {
        // Failed refreshes preserve the name and expose the row error or server cooldown.
    } finally {
        await restoreAction(trigger, account.platform);
    }
}

async function unlinkAccount(account: LinkedAccount, event: Event) {
    if (controlsLocked.value) return;
    const trigger = event.currentTarget as HTMLElement | null;
    confirmingPlatform.value = account.platform;
    confirmationError.value = null;
    success.value = null;
    try {
        await ElMessageBox.confirm(
            t('binding.workbench.unlink_confirm_target', {
                platform: platformName(account.platform),
                account: account.platformUsername
                    ? `${account.platformUsername} (${account.platformUid})`
                    : account.platformUid
            }),
            t('binding.unlink'),
            {
                type: 'warning',
                confirmButtonText: t('binding.unlink'),
                cancelButtonText: t('common.cancel'),
                closeOnClickModal: false
            },
            messageBoxContext
        );
        if (await binding.unlink(account.platform)) {
            success.value = t('binding.unlink_success');
            await reload();
        }
    } catch (cause) {
        if (cause !== 'cancel' && cause !== 'close' && !mutationErrors.value[account.platform]) {
            confirmationError.value = profileError(cause, t('binding.unlink_error'));
        }
    } finally {
        confirmingPlatform.value = null;
        await restoreAction(trigger, account.platform);
    }
}

async function startBinding(platform: Platform, event: Event) {
    if (controlsLocked.value || status.value !== 'success' || !canBind(platform)) return;
    success.value = null;
    confirmationError.value = null;
    const trigger = event.currentTarget as HTMLElement | null;
    if (PLATFORMS[platform].method === 'proof') {
        dialogTrigger = trigger;
        dialogPlatform.value = platform as VerifiablePlatform;
        dialogVisible.value = true;
        return;
    }
    try {
        await binding.beginOAuthBind(platform as OAuthProvider);
    } catch {
        // Keep the real provider error next to its retry action.
    } finally {
        await restoreAction(trigger, platform);
    }
}

async function setDialogVisible(value: boolean) {
    dialogVisible.value = value;
    if (!value && dialogPlatform.value) {
        await dialog.value?.waitUntilClosed();
        if (status.value === 'pending') {
            try {
                await binding.load();
            } catch {
                // Restore focus to the stable reload action when the post-link reload fails.
            }
        }
        await restoreAction(dialogTrigger, dialogPlatform.value);
    }
}

async function bindingCompleted() {
    success.value = t('binding.verify_success');
    await reload();
}

useProfileTaskGuard({
    dirty: () => dialog.value?.dirty ?? false,
    pending: () =>
        pending.value ||
        status.value === 'pending' ||
        confirmingPlatform.value !== null ||
        Boolean(dialog.value?.pending),
    beforeLeave: async () => {
        if (
            pending.value ||
            status.value === 'pending' ||
            confirmingPlatform.value !== null ||
            dialog.value?.pending
        ) {
            throw new Error(t('profile.workbench.wait_for_action'));
        }
        leaving = true;
        dialog.value?.discard();
    }
});
watch(refreshCooldowns, scheduleCooldown, { deep: true });
onMounted(() => {
    void binding.load().catch(() => {});
});
onBeforeUnmount(() => {
    if (cooldownTimer) clearTimeout(cooldownTimer);
});
</script>

<style scoped lang="scss">
.profile-bindings {
    min-width: 0;

    &__header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: var(--space-4);
        margin-bottom: var(--space-5);
    }

    &__header h2 {
        margin-bottom: var(--space-2);
    }

    &__header > div {
        min-width: 0;
    }

    &__hint,
    &__status,
    &__uid {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        overflow-wrap: anywhere;
    }

    &__uid {
        font-size: var(--font-size-meta);
    }

    &__section + &__section {
        margin-top: var(--space-5);
    }

    &__section h3 {
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

    &__table th {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        font-weight: 600;
    }

    &__table th:first-child,
    &__table td:first-child {
        width: 21%;
        padding-left: 0;
    }

    &__table th:last-child,
    &__table td:last-child {
        width: 43%;
        padding-right: 0;
    }

    &__platform {
        display: flex;
        gap: var(--space-2);
        align-items: center;
        min-width: 0;
    }

    &__platform strong,
    &__account {
        overflow-wrap: anywhere;
    }

    &__status,
    &__uid,
    &__account {
        display: block;
    }

    &__status,
    &__uid {
        margin-top: var(--space-1);
    }

    &__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }

    &__actions .el-button {
        max-width: 100%;
        height: auto;
        min-height: 44px;
        white-space: normal;
    }

    &__actions .el-button + .el-button {
        margin-left: 0;
    }

    &__available {
        padding: 0;
        margin: 0;
        list-style: none;
    }

    &__available li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4);
        padding: var(--space-4) 0;
        border-bottom: 1px solid var(--border-color);
    }

    &__available-info {
        min-width: 0;
    }

    &__available-info .profile-bindings__hint {
        margin-top: var(--space-2);
    }

    &__available .el-button {
        flex-shrink: 0;
    }

    &__notice {
        margin-bottom: var(--space-4);
        color: var(--text-primary);
    }

    &__error {
        margin-top: var(--space-2);
        color: var(--el-color-danger);
        font-size: var(--font-size-control);
        overflow-wrap: anywhere;
    }

    &__identity-error,
    &__config-error {
        display: grid;
        justify-items: start;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
        padding: var(--space-3) var(--space-4);
        border-left: 2px solid var(--el-color-danger);
        color: var(--el-color-danger);
        overflow-wrap: anywhere;
    }

    @media (max-width: 767px) {
        &__table,
        &__table tbody {
            display: block;
        }

        &__table thead {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip-path: inset(50%);
        }

        &__table tr {
            display: grid;
            gap: var(--space-3);
            padding: var(--space-4) 0;
            border-bottom: 1px solid var(--border-color);
        }

        &__table td,
        &__table td:first-child,
        &__table td:last-child {
            display: block;
            width: auto;
            padding: 0;
            border: 0;
        }

        &__available li {
            align-items: flex-start;
            flex-wrap: wrap;
        }
    }

    @media (max-width: 479px) {
        &__header {
            grid-template-columns: minmax(0, 1fr);
        }

        &__header > .el-button {
            justify-self: start;
        }
    }
}
</style>
