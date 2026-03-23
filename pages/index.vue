<template>
    <div class="home">
        <h1 class="home__title">{{ $t('home.title') }}</h1>
        <p class="home__subtitle">{{ $t('home.subtitle') }}</p>

        <section class="home__section">
            <h2 class="home__section-title">{{ $t('home.announcements') }}</h2>
            <div v-loading="noticePending">
                <div v-if="notices && notices.length" class="home__notices">
                    <article v-for="notice in notices" :key="notice.id" class="home__notice-card">
                        <header class="home__notice-header">
                            <h3 class="home__notice-title">{{ notice.title }}</h3>
                            <el-tag v-if="notice.pinned" size="small" type="warning">
                                {{ $t('home.pinned') }}
                            </el-tag>
                        </header>
                        <p class="home__notice-content">{{ notice.content }}</p>
                        <p class="home__notice-time">{{ formatNoticeTime(notice.publishedAt) }}</p>
                    </article>
                </div>
                <el-empty v-else-if="!noticePending" :description="$t('home.no_announcements')" />
            </div>
        </section>

        <section class="home__section">
            <h2 class="home__section-title">{{ $t('home.quote') }}</h2>
            <div v-loading="quotePending" class="home__quote-card">
                <p class="home__quote-text">
                    {{ quote?.text || $t('home.quote_fallback') }}
                </p>
                <p class="home__quote-source">{{ $t('home.quote_source') }}: {{ quoteSource }}</p>
            </div>
        </section>

        <section class="home__section">
            <h2 class="home__section-title">{{ $t('home.recent_users') }}</h2>
            <div v-loading="pending">
                <div v-if="recentUsers.length" class="home__users">
                    <NuxtLink
                        v-for="u in recentUsers"
                        :key="u.id"
                        :to="`/user/${u.username}`"
                        class="home__user-card"
                    >
                        <el-avatar :size="40" :src="u.avatarUrl || undefined" class="home__avatar">
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
    </div>
</template>

<script setup lang="ts">
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

const DEFAULT_RECENT_USERS_LIMIT = 6;

const { data: publicConfig } = await useFetch<PublicConfigResponse>('/api/public/config');

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
const { data: quote, pending: quotePending } = await useFetch<QuoteSummary>('/api/public/hitokoto');
const { data: notices, pending: noticePending } =
    await useFetch<NoticeSummary[]>('/api/public/notices');

const recentUsers = computed(() => (users.value ?? []).slice(0, recentUsersLimit.value));

const quoteSource = computed(() => {
    if (!quote.value) {
        return 'CP OAuth';
    }

    return quote.value.fromWho
        ? `${quote.value.source} / ${quote.value.fromWho}`
        : quote.value.source;
});

function formatNoticeTime(raw: string): string {
    return new Date(raw).toLocaleString();
}
</script>

<style scoped lang="scss">
.home {
    max-width: 720px;

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
        margin-bottom: 36px;
    }

    &__section-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 12px;
    }

    &__section {
        margin-bottom: 28px;
    }

    &__notices {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    &__notice-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 12px 14px;
    }

    &__notice-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__notice-title {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
    }

    &__notice-content {
        margin: 8px 0 6px;
        color: var(--text-secondary);
        font-size: 13px;
        line-height: 1.65;
        white-space: pre-wrap;
    }

    &__notice-time {
        margin: 0;
        font-size: 12px;
        color: var(--text-muted);
    }

    &__quote-card {
        padding: 14px 16px;
        border-radius: 8px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
    }

    &__quote-text {
        font-size: 14px;
        line-height: 1.7;
        color: var(--text-primary);
        margin: 0;
    }

    &__quote-source {
        margin-top: 8px;
        color: var(--text-muted);
        font-size: 12px;
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
        border-radius: 6px;
        transition: background 0.15s ease;

        &:hover {
            background: var(--bg-secondary);
        }
    }

    &__avatar {
        flex-shrink: 0;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-weight: 600;
        font-size: 14px;
    }

    &__user-info {
        min-width: 0;
    }

    &__user-name {
        font-size: 13px;
        font-weight: 500;
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
</style>
