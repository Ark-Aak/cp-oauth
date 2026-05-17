<template>
    <div class="home">
        <section class="home__hero">
            <h1 class="home__title">{{ homeTitle }}</h1>
            <p class="home__subtitle">{{ $t('home.subtitle') }}</p>
        </section>

        <div class="home__layout">
            <main class="home__main">
                <section class="home__section">
                    <h2 class="home__section-title">{{ $t('home.announcements') }}</h2>
                    <div v-loading="noticePending">
                        <div v-if="notices && notices.length" class="home__notices">
                            <article
                                v-for="notice in notices"
                                :key="notice.id"
                                class="home__notice-card"
                            >
                                <header class="home__notice-header">
                                    <h3 class="home__notice-title">{{ notice.title }}</h3>
                                    <el-tag v-if="notice.pinned" size="small" type="warning">
                                        {{ $t('home.pinned') }}
                                    </el-tag>
                                </header>
                                <div class="home__notice-content" v-html="notice.content" />
                                <p class="home__notice-time">
                                    {{ formatNoticeTime(notice.publishedAt) }}
                                </p>
                            </article>
                        </div>
                        <el-empty
                            v-else-if="!noticePending"
                            :description="$t('home.no_announcements')"
                        />
                    </div>
                </section>
            </main>

            <aside class="home__side">
                <section class="home__section">
                    <h2 class="home__section-title">{{ $t('home.quote') }}</h2>
                    <div v-loading="quotePending" class="home__quote-card">
                        <p class="home__quote-text">
                            {{ quote?.text || $t('home.quote_fallback') }}
                        </p>
                        <p class="home__quote-source">
                            {{ $t('home.quote_source') }}: {{ quoteSource }}
                        </p>
                    </div>
                </section>

                <section class="home__section">
                    <h2 class="home__section-title">{{ $t('home.stats') }}</h2>
                    <div v-loading="statsPending" class="home__stats-card">
                        <div class="home__stats-grid">
                            <div v-for="item in statItems" :key="item.key" class="home__stat-cell">
                                <span class="home__stat-value">{{ formatNumber(item.value) }}</span>
                                <span class="home__stat-label">{{ item.label }}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="home__section">
                    <h2 class="home__section-title">{{ $t('home.recent_users') }}</h2>
                    <div v-loading="pending" class="home__users-card">
                        <div v-if="recentUsers.length" class="home__users">
                            <NuxtLink
                                v-for="u in recentUsers"
                                :key="u.id"
                                :to="`/user/${u.username}`"
                                class="home__user-card"
                            >
                                <AppUserAvatar
                                    :size="42"
                                    :src="u.avatarUrl || undefined"
                                    :name="u.displayName || u.username"
                                    class="home__avatar"
                                />
                                <div class="home__user-info">
                                    <p class="home__user-name">{{ u.displayName || u.username }}</p>
                                    <p class="home__user-handle">@{{ u.username }}</p>
                                    <p v-if="u.bio" class="home__user-bio">{{ u.bio }}</p>
                                </div>
                            </NuxtLink>
                        </div>
                        <el-empty v-else-if="!pending" :description="$t('home.no_users')" />
                    </div>
                </section>
            </aside>
        </div>
    </div>
</template>

<script setup lang="ts">
import { formatCSTTime } from '~/utils/time';

const { t } = useI18n();

useHead({ title: () => `${t('home.title')} - CP OAuth` });

interface UserSummary {
    id: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    createdAt: string;
}

interface QuoteSummary {
    text: string;
    source: string;
    fromWho: string | null;
}

interface NoticeSummary {
    id: string;
    title: string;
    content: string;
    pinned: boolean;
    publishedAt: string;
}

interface PublicConfigResponse {
    recentUsersCount?: number;
}

interface SiteStatsResponse {
    users: number;
    linkedAccounts: number;
    oauthClients: number;
    oauthLoginRequestsToday: number;
}

interface MeSummary {
    username: string;
    displayName: string | null;
}

const DEFAULT_RECENT_USERS_LIMIT = 6;

const { data: publicConfig } = await useFetch<PublicConfigResponse>('/api/public/config');
const token = useCookie('auth_token');
const me = ref<MeSummary | null>(null);

if (token.value) {
    try {
        me.value = await $fetch<MeSummary>('/api/auth/me', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
    } catch {
        me.value = null;
    }
}

const homeTitle = computed(() => {
    if (me.value?.username || me.value?.displayName) {
        return t('home.welcome_user', { username: me.value.displayName || me.value.username });
    }
    return t('home.title');
});

const recentUsersLimit = computed(() => {
    const raw = publicConfig.value?.recentUsersCount;
    if (typeof raw !== 'number' || Number.isNaN(raw)) {
        return DEFAULT_RECENT_USERS_LIMIT;
    }
    return Math.min(20, Math.max(1, Math.trunc(raw)));
});

const { data: users, pending } = await useFetch<UserSummary[]>('/api/users', {
    query: { limit: recentUsersLimit.value }
});
const { data: stats, pending: statsPending } =
    await useFetch<SiteStatsResponse>('/api/public/stats');
const { data: quote, pending: quotePending } = await useFetch<QuoteSummary>('/api/public/hitokoto');
const { data: notices, pending: noticePending } =
    await useFetch<NoticeSummary[]>('/api/public/notices');

const recentUsers = computed(() => (users.value ?? []).slice(0, recentUsersLimit.value));

const statItems = computed(() => [
    {
        key: 'users',
        label: t('home.stat_users'),
        value: stats.value?.users ?? 0
    },
    {
        key: 'linkedAccounts',
        label: t('home.stat_linked_accounts'),
        value: stats.value?.linkedAccounts ?? 0
    },
    {
        key: 'oauthClients',
        label: t('home.stat_oauth_clients'),
        value: stats.value?.oauthClients ?? 0
    },
    {
        key: 'oauthLoginRequestsToday',
        label: t('home.stat_oauth_requests_today'),
        value: stats.value?.oauthLoginRequestsToday ?? 0
    }
]);

const quoteSource = computed(() => {
    if (!quote.value) {
        return 'CP OAuth';
    }

    return quote.value.fromWho
        ? `${quote.value.source} / ${quote.value.fromWho}`
        : quote.value.source;
});

function formatNoticeTime(raw: string): string {
    return formatCSTTime(raw, { withSeconds: true, withTimezone: true });
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat().format(value);
}
</script>

<style scoped lang="scss">
.home {
    width: 100%;
    max-width: none;
    --home-strong: #111827;
    --home-body: #374151;
    --home-muted: #6b7280;
    --home-faint: #9ca3af;

    &__layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 40px;
        align-items: start;
    }

    &__hero {
        margin-bottom: 36px;
    }

    &__title {
        font-size: 22px;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: -0.02em;
    }

    &__subtitle {
        color: var(--text-secondary);
        margin-top: 4px;
        font-size: 14px;
    }

    &__section-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--home-strong);
        margin-bottom: 12px;
    }

    &__section {
        margin-bottom: 30px;

        &:last-child {
            margin-bottom: 0;
        }
    }

    &__notices {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    &__notice-card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 12px;
        padding: 16px 18px;
        box-shadow: var(--card-shadow);
    }

    &__notice-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__notice-title {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: var(--home-strong);
    }

    &__notice-content {
        margin: 8px 0 6px;
        color: var(--home-body);
        font-size: 13px;
        line-height: 1.65;
        white-space: pre-wrap;

        :deep(a) {
            color: var(--el-color-primary);
            text-decoration: underline;
            text-underline-offset: 2px;
        }
    }

    &__notice-time {
        margin: 0;
        font-size: 11px;
        color: var(--home-faint);
    }

    &__stats-card {
        overflow: hidden;
        border: 1px solid var(--card-border);
        border-radius: 12px;
        background: var(--card-bg);
        box-shadow: var(--card-shadow);
    }

    &__stats-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    &__stat-cell {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-height: 86px;
        padding: 18px;

        &:nth-child(odd) {
            border-right: 1px dashed var(--divider-subtle);
        }

        &:nth-child(-n + 2) {
            border-bottom: 1px dashed var(--divider-subtle);
        }
    }

    &__stat-value {
        color: var(--home-strong);
        font-size: 20px;
        font-weight: 600;
        line-height: 1.2;
    }

    &__stat-label {
        color: var(--home-muted);
        font-size: 11px;
        line-height: 1.45;
    }

    &__quote-card {
        padding: 4px 0 4px 18px;
        border-left: 3px solid var(--accent);
    }

    &__quote-text {
        font-size: 15px;
        line-height: 1.8;
        color: var(--home-strong);
        letter-spacing: 0.06em;
        margin: 0;
    }

    &__quote-source {
        margin-top: 10px;
        color: var(--home-faint);
        font-size: 11px;
        text-align: right;
    }

    &__users-card {
        padding: 6px;
        border: 1px solid var(--card-border);
        border-radius: 12px;
        background: var(--card-bg);
        box-shadow: var(--card-shadow);
    }

    &__users {
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    &__user-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        transition: background 0.15s ease;

        &:hover {
            background: var(--accent-subtle);
        }
    }

    &__avatar {
        font-size: 14px;
    }

    &__user-info {
        min-width: 0;
    }

    &__user-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--home-strong);
    }

    &__user-handle {
        font-size: 12px;
        color: var(--home-muted);
    }

    &__user-bio {
        font-size: 12px;
        color: var(--home-body);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

:global(.dark) .home {
    --home-strong: #f5f5f5;
    --home-body: #d4d4d8;
    --home-muted: #a1a1aa;
    --home-faint: #71717a;
}

@media (max-width: 1080px) {
    .home {
        &__layout {
            grid-template-columns: 1fr;
        }
    }
}

@media (max-width: 640px) {
    .home {
        &__layout {
            gap: 16px;
        }

        &__stats-grid {
            grid-template-columns: 1fr;
        }

        &__stat-cell {
            border-right: none;

            &:nth-child(-n + 2) {
                border-bottom: none;
            }

            &:not(:last-child) {
                border-bottom: 1px dashed var(--divider-subtle);
            }
        }
    }
}
</style>
