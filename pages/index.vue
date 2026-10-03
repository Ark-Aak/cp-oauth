<template>
    <div class="home">
        <AppPageHeader :title="homeTitle" :description="$t('home.task_description')" />

        <section class="home__tasks" :aria-label="$t('home.account_tasks')">
            <AppAsyncState
                :pending="identityPending"
                :error="authStatus === 'error' ? $t('identity.identity_unavailable') : null"
                @retry="retryIdentity"
            >
                <template v-if="me">
                    <div class="home__account">
                        <div class="home__identity">
                            <AppUserAvatar
                                :size="48"
                                :src="me.avatarUrl || undefined"
                                :name="me.displayName || me.username"
                            />
                            <div class="home__identity-text">
                                <p>
                                    <strong>{{ me.displayName || me.username }}</strong>
                                </p>
                                <p class="home__handle">@{{ me.username }}</p>
                            </div>
                        </div>
                        <div v-if="!me.emailVerified" class="home__verification" role="status">
                            <p>{{ $t('profile.email_unverified') }}</p>
                            <NuxtLink to="/profile?tab=basic">{{
                                $t('profile.send_verify_email')
                            }}</NuxtLink>
                        </div>
                        <div class="home__actions home__actions--account">
                            <NuxtLink
                                to="/profile?tab=bindings"
                                class="el-button el-button--primary"
                            >
                                {{ $t('binding.link_account') }}
                            </NuxtLink>
                            <NuxtLink to="/profile?tab=authorized_apps" class="el-button">
                                {{ $t('home.manage_authorizations') }}
                            </NuxtLink>
                        </div>
                    </div>
                </template>
                <template v-else-if="authStatus === 'anonymous'">
                    <div class="home__actions">
                        <NuxtLink to="/login" class="el-button el-button--primary">
                            {{ $t('auth.login.title') }}
                        </NuxtLink>
                        <NuxtLink
                            v-if="publicConfig?.registrationEnabled"
                            to="/register"
                            class="el-button"
                        >
                            {{ $t('auth.register.title') }}
                        </NuxtLink>
                        <NuxtLink to="/developer" class="home__text-action">
                            {{ $t('home.developer_path') }}
                        </NuxtLink>
                    </div>
                    <p v-if="publicConfig?.registrationEnabled === false" class="home__hint">
                        {{ $t('auth.flow.registration_closed') }}
                    </p>
                </template>
            </AppAsyncState>
            <AppAsyncState
                v-if="publicConfigError"
                :pending="false"
                :error="$t('identity.network_error')"
                @retry="refreshConfig()"
            />
        </section>

        <div class="home__layout">
            <section class="home__announcements" aria-labelledby="home-announcements">
                <h2 id="home-announcements">{{ $t('home.announcements') }}</h2>
                <AppAsyncState
                    :pending="noticePending"
                    :error="noticeError ? $t('identity.network_error') : null"
                    :empty="!notices?.length"
                    :empty-text="$t('home.no_announcements')"
                    :empty-icon="Bell"
                    @retry="refreshNotices()"
                >
                    <div class="home__notices">
                        <article v-for="notice in notices" :key="notice.id" class="home__notice">
                            <header class="home__notice-header">
                                <h3>{{ notice.title }}</h3>
                                <span v-if="notice.pinned" class="home__notice-pinned">
                                    <Pin :size="14" aria-hidden="true" /> {{ $t('home.pinned') }}
                                </span>
                            </header>
                            <div class="home__notice-content" v-html="notice.content" />
                            <p class="home__notice-time">
                                <time :datetime="notice.publishedAt">{{
                                    formatNoticeTime(notice.publishedAt)
                                }}</time>
                            </p>
                        </article>
                    </div>
                </AppAsyncState>
            </section>

            <aside class="home__side">
                <section class="home__section" aria-labelledby="home-stats">
                    <h2 id="home-stats">{{ $t('home.stats') }}</h2>
                    <AppAsyncState
                        :pending="statsPending"
                        :error="statsError || !stats ? $t('identity.network_error') : null"
                        @retry="refreshStats()"
                    >
                        <dl class="home__stats">
                            <div v-for="item in statItems" :key="item.key" class="home__stat">
                                <dt>{{ item.label }}</dt>
                                <dd>{{ formatNumber(item.value) }}</dd>
                            </div>
                        </dl>
                    </AppAsyncState>
                </section>

                <section class="home__section" aria-labelledby="home-recent-users">
                    <h2 id="home-recent-users">{{ $t('home.recent_users') }}</h2>
                    <AppAsyncState
                        :pending="usersPending"
                        :error="usersError ? $t('identity.network_error') : null"
                        :empty="!recentUsers.length"
                        :empty-text="$t('home.no_users')"
                        :empty-icon="UsersRound"
                        @retry="refreshUsers()"
                    >
                        <ul class="home__users">
                            <li v-for="u in recentUsers" :key="u.id">
                                <NuxtLink
                                    :to="`/user/${u.username}`"
                                    class="home__user ui-navigation-link"
                                >
                                    <AppUserAvatar
                                        :size="40"
                                        :src="u.avatarUrl || undefined"
                                        :name="u.displayName || u.username"
                                    />
                                    <div class="home__user-info">
                                        <p class="home__user-name">
                                            {{ u.displayName || u.username }}
                                        </p>
                                        <p class="home__handle">@{{ u.username }}</p>
                                        <p v-if="u.bio" class="home__user-bio">{{ u.bio }}</p>
                                    </div>
                                </NuxtLink>
                            </li>
                        </ul>
                    </AppAsyncState>
                </section>
            </aside>
        </div>

        <section class="home__quote" aria-labelledby="home-quote">
            <h2 id="home-quote">{{ $t('home.quote') }}</h2>
            <AppAsyncState
                :pending="quotePending || (!quote && !quoteError)"
                :error="quoteError ? $t('identity.network_error') : null"
                @retry="refreshQuote()"
            >
                <blockquote>
                    <p>{{ quote?.text || $t('home.quote_fallback') }}</p>
                    <footer>{{ $t('home.quote_source') }}: {{ quoteSource }}</footer>
                </blockquote>
            </AppAsyncState>
        </section>
    </div>
</template>

<script setup lang="ts">
import { Bell, Pin, UsersRound } from 'lucide-vue-next';
import { formatCSTTime } from '~/utils/time';
import type { NoticeSummary, QuoteSummary, SiteStatsResponse, UserSummary } from '~/types/api';

const { t, locale } = useI18n();
useHead({ title: () => `${t('home.title')} - CP OAuth` });

const api = useApi();
const { user: me, status: authStatus, load } = useAuth();
const identityPending = ref(true);

const DEFAULT_RECENT_USERS_LIMIT = 6;

const configRequest = usePublicConfig();
const statsRequest = useAsyncData('public:stats', () =>
    api<SiteStatsResponse>('/api/public/stats')
);
const noticesRequest = useAsyncData('public:notices', async () => {
    const entries = await api<NoticeSummary[]>('/api/public/notices');
    for (const notice of entries) {
        notice.content = notice.content.replace(
            /<(\/?)h([1-6])>/g,
            (_tag, closing: string, level: string) =>
                `<${closing}h${Math.min(6, Number(level) + 3)}>`
        );
    }
    return entries;
});
const identityRequest = retryIdentity();
const {
    data: publicConfig,
    error: publicConfigError,
    refresh: refreshConfig
} = await configRequest;

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

const [usersState, statsState, noticesState] = await Promise.all([
    useAsyncData(
        'public:recent-users',
        () => api<UserSummary[]>('/api/users', { query: { limit: recentUsersLimit.value } }),
        { watch: [recentUsersLimit] }
    ),
    statsRequest,
    noticesRequest
]);
const { data: users, pending: usersPending, error: usersError, refresh: refreshUsers } = usersState;
const { data: stats, pending: statsPending, error: statsError, refresh: refreshStats } = statsState;
const {
    data: notices,
    pending: noticePending,
    error: noticeError,
    refresh: refreshNotices
} = noticesState;
await identityRequest;
const {
    data: quote,
    pending: quotePending,
    error: quoteError,
    refresh: refreshQuote
} = await useLazyAsyncData('public:hitokoto', () => api<QuoteSummary>('/api/public/hitokoto'), {
    server: false
});

const recentUsers = computed(() => (users.value ?? []).slice(0, recentUsersLimit.value));

const statItems = computed(() =>
    stats.value
        ? [
              { key: 'users', label: t('home.stat_users'), value: stats.value.users },
              {
                  key: 'linkedAccounts',
                  label: t('home.stat_linked_accounts'),
                  value: stats.value.linkedAccounts
              },
              {
                  key: 'oauthClients',
                  label: t('home.stat_oauth_clients'),
                  value: stats.value.oauthClients
              },
              {
                  key: 'oauthLoginRequestsToday',
                  label: t('home.stat_oauth_requests_today'),
                  value: stats.value.oauthLoginRequestsToday
              }
          ]
        : []
);

const quoteSource = computed(() => {
    if (!quote.value) {
        return 'CP OAuth';
    }

    return quote.value.fromWho
        ? `${quote.value.source} / ${quote.value.fromWho}`
        : quote.value.source;
});

async function retryIdentity(): Promise<void> {
    identityPending.value = true;
    try {
        await load(authStatus.value === 'error');
    } catch {
        // Preserve the shared error state; a network failure is not a sign-out.
    } finally {
        identityPending.value = false;
    }
}

function formatNoticeTime(raw: string): string {
    return formatCSTTime(raw, { withSeconds: true, withTimezone: true });
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat(locale.value).format(value);
}
</script>

<style scoped lang="scss">
.home {
    min-width: 0;

    &__tasks {
        padding-bottom: var(--space-6);
        margin-bottom: var(--space-6);
        border-bottom: 1px solid var(--border-color);
    }

    &__account {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        column-gap: var(--space-5);
    }

    &__identity {
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }

    &__identity-text,
    &__user-info {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    &__handle,
    &__hint {
        color: var(--text-muted);
        font-size: 14px;
    }

    &__hint {
        margin-top: var(--space-3);
    }

    &__verification {
        grid-column: 1;
        grid-row: 2;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2) var(--space-4);
        margin-top: var(--space-3);
        justify-self: start;
        max-width: 100%;
        min-width: 0;
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--el-color-warning);
        border-radius: 0;
        background: var(--el-color-warning-light-9);
        color: var(--el-color-warning);
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
        overflow-wrap: anywhere;

        a {
            display: inline-flex;
            align-items: center;
            min-height: 28px;
        }
    }

    &__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3);
        margin-top: var(--space-4);

        .el-button {
            min-height: 44px;
            height: auto;
            margin: 0;
            white-space: normal;
            text-align: center;
        }
    }

    &__actions--account {
        grid-column: 2;
        grid-row: 1;
        justify-content: flex-end;
        margin-top: 0;
    }

    &__text-action {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        min-height: 44px;
        font-size: 14px;
    }

    &__layout {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
        gap: var(--space-6);
        align-items: start;
    }

    &__announcements,
    &__side,
    &__section {
        min-width: 0;
    }

    &__side {
        display: grid;
        gap: var(--space-6);
    }

    h2 {
        margin-bottom: var(--space-4);
    }

    &__notices {
        display: grid;
        gap: var(--space-4);
    }

    &__notice {
        min-width: 0;
        padding: var(--space-5);
        border: 1px solid var(--card-border);
        border-radius: var(--card-radius);
        background: var(--card-bg);
    }

    &__notice-header {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2) var(--space-3);

        h3 {
            overflow-wrap: anywhere;
        }
    }

    &__notice-pinned {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        flex-shrink: 0;
        padding: 2px 8px;
        border-radius: 4px;
        background: #febb45;
        color: #431407;
        font-size: 12px;
        font-weight: 600;
        line-height: 20px;
    }

    &__notice-content {
        margin: var(--space-3) 0;
        color: var(--text-secondary);
        white-space: pre-wrap;
        overflow-wrap: anywhere;

        :deep(img) {
            max-width: 100%;
            height: auto;
        }
    }

    &__notice-time {
        font-size: 14px;
        color: var(--text-muted);
    }

    &__stats {
        margin: 0;
    }

    &__stat {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-4);
        padding: var(--space-3) 0;
        border-bottom: 1px solid var(--border-color);

        dt {
            color: var(--text-secondary);
            font-size: 14px;
        }

        dd {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            overflow-wrap: anywhere;
        }
    }

    &__users {
        list-style: none;
        margin: 0;
        padding: 0;

        li + li {
            border-top: 1px solid var(--border-color);
        }
    }

    &__user {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        min-height: 64px;
        padding: var(--space-3) 0;
    }

    &__user-name {
        font-weight: 600;
    }

    &__user-bio {
        color: var(--text-secondary);
        font-size: 14px;
        margin-top: var(--space-1);
    }

    &__quote {
        margin-top: var(--space-6);
        padding-top: var(--space-5);
        border-top: 1px solid var(--border-color);

        blockquote {
            margin: 0;
            padding-left: var(--space-4);
            border-left: 2px solid var(--border-color);
            color: var(--text-secondary);
            overflow-wrap: anywhere;
        }

        footer {
            margin-top: var(--space-2);
            font-size: 14px;
            color: var(--text-muted);
        }
    }
}

@media (max-width: 767px) {
    .home__layout {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 479px) {
    .home__account {
        column-gap: var(--space-3);
    }

    .home__actions--account {
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-2);
    }

    .home__verification {
        grid-column: 1 / -1;
    }

    .home__notice {
        padding: var(--space-4);
    }

    .home__actions > .el-button {
        width: 100%;
    }
}
</style>
