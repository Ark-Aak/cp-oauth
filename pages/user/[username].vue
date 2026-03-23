<template>
    <div v-if="user" class="user-profile">
        <!-- Header -->
        <div class="user-profile__header">
            <el-avatar :size="72" :src="user.avatarUrl || undefined" class="user-profile__avatar">
                {{ (user.displayName || user.username).charAt(0).toUpperCase() }}
            </el-avatar>
            <div class="user-profile__meta">
                <h1 class="user-profile__name">{{ user.displayName || user.username }}</h1>
                <p class="user-profile__handle">@{{ user.username }}</p>
                <p v-if="user.bio" class="user-profile__bio">{{ user.bio }}</p>
                <p class="user-profile__joined">
                    {{ $t('user.joined') }} {{ new Date(user.createdAt).toLocaleDateString() }}
                </p>
            </div>
        </div>

        <!-- Linked CP Accounts -->
        <el-card shadow="never" class="user-profile__section">
            <template #header>
                <span class="user-profile__section-title">{{ $t('user.linked_accounts') }}</span>
            </template>
            <div v-if="cpLinkedAccounts.length">
                <div
                    v-for="account in cpLinkedAccounts"
                    :key="account.platform"
                    class="user-profile__linked-item"
                >
                    <span class="user-profile__linked-platform">
                        <AppPlatformIcon :platform="account.platform" />
                        <span>{{ $t(`binding.platforms.${account.platform}`) }}</span>
                    </span>
                    <span class="user-profile__linked-uid-row">
                        <a
                            v-if="getProfileUrl(account)"
                            :href="getProfileUrl(account)!"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="user-profile__linked-link"
                        >
                            {{ account.platformUsername || account.platformUid }}
                            <ExternalLink :size="12" :stroke-width="1.5" />
                        </a>
                        <span v-else class="user-profile__linked-uid">
                            {{ account.platformUsername || account.platformUid }}
                        </span>
                        <el-button
                            v-if="canRefresh(account.platform)"
                            text
                            size="small"
                            :loading="
                                refreshingPlatformUid ===
                                `${account.platform}:${account.platformUid}`
                            "
                            :title="$t('binding.refresh_username')"
                            @click="handleRefreshUsername(account)"
                        >
                            <RefreshCw :size="13" :stroke-width="1.5" />
                        </el-button>
                    </span>
                </div>
            </div>
            <el-empty v-else :description="$t('user.no_linked')" :image-size="48" />
        </el-card>

        <el-card shadow="never" class="user-profile__section">
            <template #header>
                <span class="user-profile__section-title">{{ $t('user.other_accounts') }}</span>
            </template>
            <div v-if="otherLinkedAccounts.length">
                <div
                    v-for="account in otherLinkedAccounts"
                    :key="account.platform"
                    class="user-profile__linked-item"
                >
                    <span class="user-profile__linked-platform">
                        <AppPlatformIcon :platform="account.platform" />
                        <span>{{ $t(`binding.platforms.${account.platform}`) }}</span>
                    </span>
                    <a
                        v-if="getProfileUrl(account)"
                        :href="getProfileUrl(account)!"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="user-profile__linked-link"
                    >
                        {{ account.platformUsername || account.platformUid }}
                        <ExternalLink :size="12" :stroke-width="1.5" />
                    </a>
                    <span v-else class="user-profile__linked-uid">
                        {{ account.platformUsername || account.platformUid }}
                    </span>
                </div>
            </div>
            <el-empty v-else :description="$t('user.no_other_accounts')" :image-size="48" />
        </el-card>

        <!-- Homepage (Markdown) -->
        <el-card v-if="user.homepage" shadow="never" class="user-profile__section">
            <template #header>
                <span class="user-profile__section-title">{{ $t('user.homepage') }}</span>
            </template>
            <div v-if="renderedHtml" class="user-profile__markdown" v-html="renderedHtml" />
            <p v-else class="user-profile__loading-md">{{ $t('user.loading') }}</p>
        </el-card>
    </div>
    <el-empty v-else-if="error" :description="$t('user.not_found')" />
    <div v-else v-loading="true" class="user-profile__loading" />
</template>

<script setup lang="ts">
import { ExternalLink, RefreshCw } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { renderMarkdown } from '~/utils/markdown';

const { t } = useI18n();
const route = useRoute();
const colorMode = useColorMode();

const username = route.params.username as string;

const platformProfileUrls: Record<string, (uid: string, uname: string | null) => string | null> = {
    luogu: uid => `https://www.luogu.com.cn/user/${uid}`,
    codeforces: (_uid, uname) => (uname ? `https://codeforces.com/profile/${uname}` : null),
    atcoder: (_uid, uname) => (uname ? `https://atcoder.jp/users/${uname}` : null),
    github: (_uid, uname) => (uname ? `https://github.com/${uname}` : null)
};

function getProfileUrl(account: {
    platform: string;
    platformUid: string;
    platformUsername: string | null;
}): string | null {
    const fn = platformProfileUrls[account.platform];
    return fn ? fn(account.platformUid, account.platformUsername) : null;
}

useHead({ title: () => `@${username} - CP OAuth` });

interface UserProfile {
    id: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    homepage: string | null;
    avatarUrl: string | null;
    createdAt: string;
    linkedAccounts?: {
        platform: string;
        platformUid: string;
        platformUsername: string | null;
    }[];
}

const { data: user, error } = await useFetch<UserProfile>(`/api/users/${username}`);

const renderedHtml = ref('');
const cpPlatforms = new Set(['luogu', 'codeforces', 'atcoder']);
const refreshablePlatforms = new Set(['luogu', 'codeforces']);
const refreshingPlatformUid = ref('');

function canRefresh(platform: string): boolean {
    return refreshablePlatforms.has(platform);
}

async function handleRefreshUsername(account: {
    platform: string;
    platformUid: string;
    platformUsername: string | null;
}) {
    const key = `${account.platform}:${account.platformUid}`;
    refreshingPlatformUid.value = key;
    try {
        const result = await $fetch<{ platformUsername: string }>('/api/account/refresh-username', {
            method: 'POST',
            body: { platform: account.platform, platformUid: account.platformUid }
        });
        account.platformUsername = result.platformUsername;
        ElMessage.success(t('binding.refresh_success'));
    } catch (e: unknown) {
        const err = e as { statusCode?: number; data?: { message?: string } };
        if (err.statusCode === 429) {
            ElMessage.warning(err.data?.message || t('binding.refresh_cooldown'));
        } else {
            ElMessage.error(err.data?.message || t('binding.refresh_error'));
        }
    } finally {
        refreshingPlatformUid.value = '';
    }
}

const cpLinkedAccounts = computed(
    () => user.value?.linkedAccounts?.filter(account => cpPlatforms.has(account.platform)) || []
);
const otherLinkedAccounts = computed(
    () => user.value?.linkedAccounts?.filter(account => !cpPlatforms.has(account.platform)) || []
);

const currentTheme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'));

async function render() {
    if (!user.value?.homepage) {
        renderedHtml.value = '';
        return;
    }
    renderedHtml.value = await renderMarkdown(user.value.homepage, currentTheme.value);
}

watch(currentTheme, render);
watch(() => user.value?.homepage, render);
await render();
</script>

<style scoped lang="scss">
.user-profile {
    max-width: 720px;

    &__header {
        display: flex;
        gap: 16px;
        margin-bottom: 28px;
    }

    &__avatar {
        flex-shrink: 0;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-weight: 600;
        font-size: 22px;
    }

    &__meta {
        min-width: 0;
    }

    &__name {
        font-size: 22px;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: -0.02em;
    }

    &__handle {
        font-size: 13px;
        color: var(--text-muted);
        margin-top: 2px;
    }

    &__bio {
        font-size: 13px;
        color: var(--text-secondary);
        margin-top: 6px;
        line-height: 1.6;
    }

    &__joined {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 6px;
    }

    &__section {
        margin-bottom: 20px;
        border: 1px solid var(--border-color);
    }

    &__section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
    }

    &__loading-md {
        font-size: 13px;
        color: var(--text-muted);
    }

    &__loading {
        min-height: 200px;
    }

    &__linked-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 7px 0;

        & + & {
            border-top: 1px solid var(--border-color);
        }
    }

    &__linked-platform {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
        min-width: 60px;
    }

    &__linked-uid {
        font-size: 12px;
        color: var(--text-secondary);
    }

    &__linked-uid-row {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    &__linked-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--text-secondary);
        text-decoration: none;
        transition: color 0.15s ease;

        &:hover {
            color: var(--text-primary);
        }
    }

    &__markdown {
        font-size: 14px;
        color: var(--text-primary);
        line-height: 1.8;

        :deep(h1),
        :deep(h2),
        :deep(h3) {
            font-weight: 600;
            color: var(--text-primary);
            margin: 18px 0 6px;
        }

        :deep(h1) {
            font-size: 20px;
        }
        :deep(h2) {
            font-size: 17px;
        }
        :deep(h3) {
            font-size: 15px;
        }

        :deep(p) {
            margin-bottom: 10px;
        }

        :deep(a) {
            color: var(--accent);
            text-decoration: underline;
        }

        :deep(code) {
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 12px;
            background: var(--bg-tertiary);
            padding: 2px 5px;
            border-radius: 3px;
        }

        :deep(pre) {
            border: 1px solid var(--border-color);
            border-radius: 6px;
            overflow-x: auto;
            margin-bottom: 14px;

            code {
                background: none;
                padding: 0;
            }
        }

        :deep(.shiki) {
            padding: 12px 14px;
            border-radius: 6px;
            overflow-x: auto;
        }

        :deep(ul),
        :deep(ol) {
            padding-left: 18px;
            margin-bottom: 10px;
        }

        :deep(li) {
            margin-bottom: 3px;
        }

        :deep(blockquote) {
            border-left: 2px solid var(--border-color);
            padding-left: 14px;
            color: var(--text-secondary);
            margin-bottom: 10px;
        }

        :deep(img) {
            max-width: 100%;
            border-radius: 6px;
        }

        :deep(hr) {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 18px 0;
        }

        :deep(table) {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;

            th,
            td {
                border: 1px solid var(--border-color);
                padding: 6px 10px;
                text-align: left;
            }

            th {
                background: var(--bg-tertiary);
                font-weight: 600;
            }
        }
    }
}
</style>
