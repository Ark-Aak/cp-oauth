<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.account')"
            :title="t('common.nav.bindings')"
            :description="t('connections.description')"
        />

        <CpSheet flush>
            <template #footer>
                <p class="bindings__footnote">
                    {{ t('connections.footnote') }}
                    <NuxtLink to="/profile?tab=privacy">{{ t('common.nav.privacy') }}</NuxtLink>
                </p>
            </template>
            <CpDataState
                :pending="pending"
                :error="error ? describe(error) : null"
                :rows="7"
                @retry="refresh"
            >
                <ul class="cp-rows">
                    <li v-for="platform in PLATFORM_NAMES" :key="platform" class="bindings__row">
                        <span class="bindings__platform">
                            <CpPlatformMark :platform="platform" :size="20" />
                        </span>
                        <div class="cp-rows__main">
                            <template v-if="linked[platform]">
                                <span class="cp-rows__title cp-mono">
                                    {{
                                        linked[platform]!.platformUsername ||
                                        linked[platform]!.platformUid
                                    }}
                                </span>
                                <span class="cp-rows__meta">
                                    <span v-if="linked[platform]!.platformUsername" class="cp-mono">
                                        {{
                                            t('connections.uid', {
                                                uid: linked[platform]!.platformUid
                                            })
                                        }}
                                        ·
                                    </span>
                                    {{
                                        t('connections.verifiedAt', {
                                            date: date(linked[platform]!.verifiedAt)
                                        })
                                    }}
                                </span>
                            </template>
                            <template v-else>
                                <span class="cp-rows__meta">{{ t('connections.notLinked') }}</span>
                                <span v-if="!canLink(platform)" class="cp-rows__meta">
                                    {{ t('connections.notConfigured') }}
                                </span>
                            </template>
                        </div>
                        <div class="cp-rows__end">
                            <template v-if="linked[platform]">
                                <el-button
                                    v-if="PLATFORMS[platform].refreshable"
                                    size="small"
                                    :loading="busy === `refresh:${platform}`"
                                    :disabled="!hydrated || !!busy"
                                    @click="refreshName(platform)"
                                >
                                    {{ t('connections.refreshName') }}
                                </el-button>
                                <el-button
                                    type="danger"
                                    plain
                                    size="small"
                                    :loading="busy === `unlink:${platform}`"
                                    :disabled="!hydrated || !!busy"
                                    @click="unlink(platform)"
                                >
                                    {{ t('connections.unlink') }}
                                </el-button>
                            </template>
                            <el-button
                                v-else-if="canLink(platform)"
                                size="small"
                                :loading="busy === `link:${platform}`"
                                :disabled="!hydrated || !!busy"
                                @click="link(platform)"
                            >
                                {{ t('connections.link.action') }}
                            </el-button>
                        </div>
                    </li>
                </ul>
            </CpDataState>
        </CpSheet>

        <ProfileBindingsDialog v-model="proofPlatform" @linked="onLinked" />
    </div>
</template>

<script setup lang="ts">
import type { LinkedAccount } from '~/types/api';
import {
    OAUTH_PROVIDERS,
    PLATFORMS,
    PLATFORM_NAMES,
    VERIFIABLE_PLATFORMS,
    type OAuthProvider,
    type Platform,
    type VerifiablePlatform
} from '~/utils/platforms';

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();
const { date } = useFormat();
const hydrated = useHydrated();
const session = useSession();
const reauth = useReauth();
const startProvider = useProviderStart();
const { config } = usePublicConfig();

const { data, pending, error, refresh } = await useAsyncData('profile-bindings', () =>
    api<LinkedAccount[]>('/api/account/bindings')
);

const linked = computed(() => {
    const map: Partial<Record<Platform, LinkedAccount>> = {};
    for (const account of data.value ?? []) map[account.platform] = account;
    return map;
});

const busy = ref<string | null>(null);
const proofPlatform = ref<VerifiablePlatform | null>(null);

const providerEnabled: Record<OAuthProvider, () => boolean> = {
    github: () => config.value.githubLoginEnabled,
    google: () => config.value.googleLoginEnabled,
    codeforces: () => config.value.codeforcesLoginEnabled,
    clist: () => config.value.clistLoginEnabled
};

function isProvider(platform: Platform): platform is OAuthProvider {
    return (OAUTH_PROVIDERS as Platform[]).includes(platform);
}

function canLink(platform: Platform): boolean {
    return isProvider(platform)
        ? providerEnabled[platform]()
        : (VERIFIABLE_PLATFORMS as Platform[]).includes(platform);
}

async function link(platform: Platform) {
    if (!isProvider(platform)) {
        proofPlatform.value = platform as VerifiablePlatform;
        return;
    }
    busy.value = `link:${platform}`;
    try {
        const reauthToken = await reauth.request('binding_change');
        if (!reauthToken) return;
        await startProvider(
            platform,
            { mode: 'bind', redirect: '/profile?tab=bindings' },
            reauthToken
        );
    } catch (cause) {
        ElMessage.error(describe(cause));
    } finally {
        busy.value = null;
    }
}

async function onLinked(account: LinkedAccount) {
    await Promise.all([refresh(), session.refresh()]);
    ElMessage.success(t('connections.linked', { platform: PLATFORMS[account.platform].name }));
}

async function unlink(platform: Platform) {
    try {
        await ElMessageBox.confirm(
            t('connections.unlinkConfirm', { platform: PLATFORMS[platform].name }),
            t('connections.unlinkTitle'),
            {
                type: 'warning',
                confirmButtonText: t('connections.unlink'),
                cancelButtonText: t('common.actions.cancel'),
                confirmButtonClass: 'el-button--danger'
            }
        );
    } catch {
        return;
    }
    busy.value = `unlink:${platform}`;
    try {
        const reauthToken = await reauth.request('binding_change');
        if (!reauthToken) return;
        await api(`/api/account/bind/${platform}`, { method: 'DELETE', reauthToken });
        await Promise.all([refresh(), session.refresh()]);
        ElMessage.success(t('connections.unlinked', { platform: PLATFORMS[platform].name }));
    } catch (cause) {
        ElMessage.error(describe(cause));
    } finally {
        busy.value = null;
    }
}

async function refreshName(platform: Platform) {
    const account = linked.value[platform];
    if (!account) return;
    busy.value = `refresh:${platform}`;
    try {
        const result = await api<{ platformUsername: string }>('/api/account/refresh-username', {
            method: 'POST',
            body: { platform, platformUid: account.platformUid }
        });
        await refresh();
        ElMessage.success(t('connections.refreshed', { name: result.platformUsername }));
    } catch (cause) {
        ElMessage.error(describe(cause));
    } finally {
        busy.value = null;
    }
}
</script>

<style scoped lang="scss">
.bindings__platform {
    flex: none;
    width: 140px;
}

.bindings__footnote {
    flex: 1;
    font-size: var(--cp-text-sm);
    color: var(--cp-text-3);
}

@media (max-width: 767px) {
    .bindings__platform {
        width: 100%;
    }
}
</style>
