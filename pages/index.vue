<template>
    <div class="home">
        <div class="home__layout">
            <main class="home__pane home__pane--main">
                <section class="home__hero">
                    <div class="home__brand">
                        <Sparkles :size="15" :stroke-width="1.7" />
                        <span>CP OAuth</span>
                    </div>
                    <h1 class="home__title">{{ homeTitle }}</h1>
                    <p class="home__subtitle">{{ $t('home.subtitle') }}</p>
                </section>

                <section class="home__section">
                    <div class="home__section-heading">
                        <span class="home__section-icon home__section-icon--stats">
                            <Activity :size="16" :stroke-width="1.7" />
                        </span>
                        <h2 class="home__section-title">{{ $t('home.stats') }}</h2>
                    </div>
                    <div v-loading="statsPending" class="home__stats-grid">
                        <div v-for="item in statItems" :key="item.key" class="home__stat-card">
                            <span class="home__stat-icon">
                                <component :is="item.icon" :size="17" :stroke-width="1.7" />
                            </span>
                            <span class="home__stat-value">{{ formatNumber(item.value) }}</span>
                            <span class="home__stat-label">{{ item.label }}</span>
                        </div>
                    </div>
                </section>

                <section class="home__section">
                    <div class="home__section-heading">
                        <span class="home__section-icon">
                            <Megaphone :size="16" :stroke-width="1.7" />
                        </span>
                        <h2 class="home__section-title">{{ $t('home.announcements') }}</h2>
                    </div>
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

            <aside class="home__pane home__pane--side">
                <section class="home__section">
                    <div class="home__section-heading">
                        <span class="home__section-icon home__section-icon--quote">
                            <QuoteIcon :size="16" :stroke-width="1.7" />
                        </span>
                        <h2 class="home__section-title">{{ $t('home.quote') }}</h2>
                    </div>
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
                    <div class="home__section-heading">
                        <span class="home__section-icon home__section-icon--users">
                            <UsersRound :size="16" :stroke-width="1.7" />
                        </span>
                        <h2 class="home__section-title">{{ $t('home.recent_users') }}</h2>
                    </div>
                    <div v-loading="pending">
                        <div v-if="recentUsers.length" class="home__users">
                            <NuxtLink
                                v-for="u in recentUsers"
                                :key="u.id"
                                :to="`/user/${u.username}`"
                                class="home__user-card"
                            >
                                <el-avatar
                                    :size="42"
                                    :src="u.avatarUrl || undefined"
                                    class="home__avatar"
                                >
                                    {{ (u.displayName || u.username).charAt(0).toUpperCase() }}
                                </el-avatar>
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
import {
    Activity,
    KeyRound,
    Link2,
    Megaphone,
    Quote as QuoteIcon,
    Sparkles,
    UserRound,
    UsersRound,
    Zap
} from 'lucide-vue-next';
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
    if (me.value?.username) {
        return t('home.welcome_user', { username: me.value.username });
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
        value: stats.value?.users ?? 0,
        icon: UserRound
    },
    {
        key: 'linkedAccounts',
        label: t('home.stat_linked_accounts'),
        value: stats.value?.linkedAccounts ?? 0,
        icon: Link2
    },
    {
        key: 'oauthClients',
        label: t('home.stat_oauth_clients'),
        value: stats.value?.oauthClients ?? 0,
        icon: KeyRound
    },
    {
        key: 'oauthLoginRequestsToday',
        label: t('home.stat_oauth_requests_today'),
        value: stats.value?.oauthLoginRequestsToday ?? 0,
        icon: Zap
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
    max-width: 1180px;

    &__layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
        gap: 24px;
        align-items: start;
    }

    &__pane {
        position: relative;
        border: 1px solid var(--border-color);
        border-radius: 24px;
        overflow: hidden;

        &::before {
            content: '';
            position: absolute;
            inset: 0;
            pointer-events: none;
        }
    }

    &__pane--main {
        min-height: calc(100vh - 96px);
        padding: 28px;
        background:
            radial-gradient(circle at 12% 10%, rgba(80, 141, 255, 0.16), transparent 34%),
            linear-gradient(145deg, var(--bg-primary), var(--bg-secondary));

        &::before {
            background-image:
                linear-gradient(rgba(127, 127, 127, 0.08) 1px, transparent 1px),
                linear-gradient(90deg, rgba(127, 127, 127, 0.08) 1px, transparent 1px);
            background-size: 32px 32px;
            mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent 52%);
        }
    }

    &__pane--side {
        display: flex;
        flex-direction: column;
        gap: 22px;
        padding: 20px;
        background:
            radial-gradient(circle at 90% 6%, rgba(246, 166, 35, 0.13), transparent 30%),
            linear-gradient(180deg, var(--bg-secondary), var(--bg-primary));
    }

    &__hero {
        position: relative;
        z-index: 1;
        padding: 10px 0 24px;
        max-width: 680px;
    }

    &__brand {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: fit-content;
        padding: 7px 11px;
        margin-bottom: 18px;
        border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border-color));
        border-radius: 999px;
        background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    &__title {
        font-size: clamp(30px, 5vw, 54px);
        line-height: 1.02;
        font-weight: 800;
        color: var(--text-primary);
        letter-spacing: -0.055em;
    }

    &__subtitle {
        color: var(--text-secondary);
        margin-top: 14px;
        font-size: clamp(15px, 1.8vw, 18px);
        max-width: 560px;
    }

    &__section-heading {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
    }

    &__section-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 11px;
        background: color-mix(in srgb, var(--accent) 12%, var(--bg-primary));
        color: var(--accent);
        border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border-color));
        flex-shrink: 0;
    }

    &__section-icon--quote {
        background: color-mix(in srgb, #d97706 12%, var(--bg-primary));
        color: #d97706;
        border-color: color-mix(in srgb, #d97706 20%, var(--border-color));
    }

    &__section-icon--users {
        background: color-mix(in srgb, #0f9f8f 12%, var(--bg-primary));
        color: #0f9f8f;
        border-color: color-mix(in srgb, #0f9f8f 20%, var(--border-color));
    }

    &__section-icon--stats {
        background: color-mix(in srgb, #508dff 12%, var(--bg-primary));
        color: #508dff;
        border-color: color-mix(in srgb, #508dff 20%, var(--border-color));
    }

    &__section-title {
        font-size: 16px;
        font-weight: 750;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: -0.02em;
    }

    &__section {
        position: relative;
        z-index: 1;
        margin-bottom: 30px;

        &:last-child {
            margin-bottom: 0;
        }
    }

    &__notices {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    &__notice-card {
        background: color-mix(in srgb, var(--bg-primary) 78%, transparent);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 16px 18px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.04);
        backdrop-filter: blur(10px);
    }

    &__notice-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__notice-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: var(--text-primary);
    }

    &__notice-content {
        margin: 8px 0 6px;
        color: var(--text-secondary);
        font-size: 14px;
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
        font-size: 12px;
        color: var(--text-muted);
    }

    &__stats-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        min-height: 112px;
    }

    &__stat-card {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 112px;
        padding: 14px;
        border: 1px solid var(--border-color);
        border-radius: 16px;
        background:
            linear-gradient(145deg, color-mix(in srgb, #508dff 8%, transparent), transparent 48%),
            color-mix(in srgb, var(--bg-primary) 80%, transparent);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.04);
        backdrop-filter: blur(10px);
    }

    &__stat-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 12px;
        background: color-mix(in srgb, #508dff 12%, var(--bg-primary));
        color: #508dff;
        border: 1px solid color-mix(in srgb, #508dff 18%, var(--border-color));
    }

    &__stat-value {
        margin-top: 16px;
        color: var(--text-primary);
        font-size: clamp(22px, 3.4vw, 32px);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.04em;
    }

    &__stat-label {
        margin-top: 8px;
        color: var(--text-muted);
        font-size: 12px;
        line-height: 1.35;
    }

    &__quote-card {
        position: relative;
        padding: 18px;
        border-radius: 18px;
        background:
            linear-gradient(135deg, color-mix(in srgb, #d97706 10%, transparent), transparent 42%),
            var(--bg-primary);
        border: 1px solid var(--border-color);
        overflow: hidden;

        &::after {
            content: '"';
            position: absolute;
            right: 14px;
            top: -20px;
            color: color-mix(in srgb, #d97706 18%, transparent);
            font-size: 96px;
            line-height: 1;
            font-family: Georgia, serif;
            pointer-events: none;
        }
    }

    &__quote-text {
        position: relative;
        z-index: 1;
        font-size: 15px;
        line-height: 1.7;
        color: var(--text-primary);
        margin: 0;
    }

    &__quote-source {
        position: relative;
        z-index: 1;
        margin-top: 8px;
        color: var(--text-muted);
        font-size: 12px;
    }

    &__users {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    &__user-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 12px;
        border-radius: 16px;
        border: 1px solid transparent;
        background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
        transition:
            background 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease;

        &:hover {
            background: var(--bg-primary);
            border-color: color-mix(in srgb, #0f9f8f 24%, var(--border-color));
            transform: translateY(-1px);
        }
    }

    &__avatar {
        flex-shrink: 0;
        background: linear-gradient(135deg, #0f9f8f, #508dff);
        color: #ffffff;
        font-weight: 700;
        font-size: 14px;
    }

    &__user-info {
        min-width: 0;
    }

    &__user-name {
        font-size: 14px;
        font-weight: 650;
        color: var(--text-primary);
    }

    &__user-handle {
        font-size: 12px;
        color: var(--text-muted);
    }

    &__user-bio {
        font-size: 12px;
        color: var(--text-secondary);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

@media (max-width: 1080px) {
    .home {
        max-width: 820px;

        &__layout {
            grid-template-columns: 1fr;
        }

        &__pane--main {
            min-height: auto;
        }

        &__stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
}

@media (max-width: 640px) {
    .home {
        &__layout {
            gap: 16px;
        }

        &__pane--main,
        &__pane--side {
            border-radius: 18px;
            padding: 16px;
        }

        &__hero {
            padding-top: 4px;
        }

        &__notice-card,
        &__quote-card,
        &__user-card {
            border-radius: 14px;
        }

        &__stats-grid {
            grid-template-columns: 1fr;
        }

        &__stat-card {
            min-height: 96px;
        }
    }
}
</style>
