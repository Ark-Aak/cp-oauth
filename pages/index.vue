<template>
    <div class="home ui-stack">
        <div class="home__intro">
            <section class="home__primary ui-card" :aria-label="$t('home.account_tasks')">
                <AppPageHeader
                    :title="homeTitle"
                    :description="$t(me ? 'home.task_description' : 'home.guest_description')"
                    :icon="House"
                />
                <AppAsyncState
                    :pending="identityPending"
                    :error="authStatus === 'error' ? $t('identity.identity_unavailable') : null"
                    @retry="retryIdentity"
                >
                    <template v-if="me">
                        <div class="home__account">
                            <div
                                v-if="!me.emailVerified"
                                class="home__verification ui-note ui-note--warning"
                                role="status"
                            >
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
                        <div class="home__actions home__actions--guest">
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

            <section class="home__quote ui-card" aria-labelledby="home-quote">
                <div class="ui-card__header">
                    <h2 id="home-quote" class="ui-card__title">
                        <Quote :size="18" aria-hidden="true" />
                        <span>{{ $t('home.quote') }}</span>
                    </h2>
                </div>
                <AppAsyncState
                    :pending="quotePending || (!quote && !quoteError)"
                    :error="quoteError ? $t('identity.network_error') : null"
                    @retry="refreshQuote()"
                >
                    <blockquote>
                        <p>{{ quote?.text || $t('home.quote_fallback') }}</p>
                        <footer>{{ $t('home.quote_source') }} {{ quoteSource }}</footer>
                    </blockquote>
                </AppAsyncState>
            </section>
        </div>

        <div class="home__layout ui-stack">
            <section class="home__announcements ui-card" aria-labelledby="home-announcements">
                <div class="ui-card__header">
                    <h2 id="home-announcements" class="ui-card__title">
                        <Bell :size="18" aria-hidden="true" />
                        <span>{{ $t('home.announcements') }}</span>
                    </h2>
                </div>
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
                <section class="home__section ui-card" aria-labelledby="home-stats">
                    <div class="ui-card__header">
                        <h2 id="home-stats" class="ui-card__title">
                            <ChartNoAxesCombined :size="18" aria-hidden="true" />
                            <span>{{ $t('home.stats') }}</span>
                        </h2>
                    </div>
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

                <section class="home__section ui-card" aria-labelledby="home-recent-users">
                    <div class="ui-card__header">
                        <h2 id="home-recent-users" class="ui-card__title">
                            <UsersRound :size="18" aria-hidden="true" />
                            <span>{{ $t('home.recent_users') }}</span>
                        </h2>
                    </div>
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
                                        :size="36"
                                        :src="u.avatarUrl || undefined"
                                        :name="u.displayName || u.username"
                                        :seed="u.id"
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
    </div>
</template>

<script setup lang="ts">
import { Bell, ChartNoAxesCombined, House, Pin, Quote, UsersRound } from 'lucide-vue-next';
import { renderMarkdown } from '~/utils/markdown';
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
    return Promise.all(
        entries.map(async notice => {
            // HTML is sanitized by the public API. Plain-text notices need block formatting.
            const content = /<[a-z][a-z0-9]*(?:\s|>)/i.test(notice.content)
                ? notice.content
                : await renderMarkdown(notice.content.replace(/([^\n])\n(?=[^\n])/g, '$1  \n'));
            return {
                ...notice,
                content: content.replace(
                    /<(\/?)h([1-6])>/g,
                    (_tag, closing: string, level: string) =>
                        `<${closing}h${Math.min(6, Number(level) + 3)}>`
                )
            };
        })
    );
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

    return quote.value.fromWho && quote.value.fromWho !== quote.value.source
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

    &__account {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-3);
    }

    &__user-info {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    &__handle {
        color: var(--text-muted);
        font-family: var(--font-code);
        font-size: var(--font-size-meta);
    }

    &__hint {
        margin-top: var(--space-3);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
    }

    &__verification {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2) var(--space-4);
        justify-self: start;
        max-width: 100%;
        min-width: 0;
        line-height: 1.4;
        overflow-wrap: anywhere;

        a {
            display: inline-flex;
            align-items: center;
        }
    }

    &__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3);
        min-width: 0;

        .el-button {
            max-width: 100%;
            margin: 0;
            text-align: center;
            overflow-wrap: anywhere;
        }
    }

    &__text-action {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        color: var(--accent);
        font-size: var(--font-size-control);
    }

    &__intro {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
        gap: var(--space-5);
    }

    &__primary,
    &__quote,
    &__announcements,
    &__side,
    &__section {
        min-width: 0;
    }

    &__side {
        display: grid;
        grid-template-columns: minmax(240px, 1fr) minmax(0, 2fr);
        gap: var(--space-5);
        align-items: start;
    }

    &__notice {
        min-width: 0;
        padding: var(--space-3) 0;

        & + & {
            border-top: 1px solid var(--divider-subtle);
        }
    }

    &__notice-header {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-2) var(--space-3);

        h3 {
            line-height: 1.5;
            overflow-wrap: anywhere;
        }
    }

    &__notice-pinned {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        flex-shrink: 0;
        color: var(--text-muted);
        font-size: var(--font-size-meta);
        font-weight: 600;
    }

    &__notice-content {
        max-width: 88ch;
        margin: var(--space-3) 0 var(--space-4);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        line-height: 1.85;
        white-space: normal;
        overflow-wrap: anywhere;

        :deep(p),
        :deep(ul),
        :deep(ol),
        :deep(blockquote),
        :deep(pre),
        :deep(h4),
        :deep(h5),
        :deep(h6) {
            margin: 0;
        }

        :deep(:where(p, ul, ol, blockquote, pre, h4, h5, h6) + *) {
            margin-top: var(--space-3);
        }

        :deep(ul),
        :deep(ol) {
            padding-inline-start: var(--space-5);
        }

        :deep(li + li),
        :deep(li > ul),
        :deep(li > ol) {
            margin-top: var(--space-1);
        }

        :deep(h4),
        :deep(h5),
        :deep(h6) {
            color: var(--text-primary);
            font-size: var(--font-size-subheading);
            line-height: 1.5;
        }

        :deep(a) {
            text-decoration: underline;
        }

        :deep(img) {
            display: block;
            max-width: 100%;
            height: auto;
        }

        :deep(blockquote) {
            padding-inline-start: var(--space-4);
            border-inline-start: 2px solid var(--border-color);
        }

        :deep(code) {
            padding: 0 var(--space-1);
            border-radius: var(--el-border-radius-base);
            background: var(--bg-tertiary);
            font-size: inherit;
        }

        :deep(pre) {
            max-width: 100%;
            padding: var(--space-3);
            border: 1px solid var(--border-color);
            border-radius: var(--el-border-radius-base);
            background: var(--bg-secondary);
            line-height: 1.65;
            white-space: pre;
            overflow-wrap: normal;
            overflow-x: auto;
        }

        :deep(pre code) {
            padding: 0;
            border-radius: 0;
            background: none;
            white-space: inherit;
        }
    }

    &__notice-time {
        font-size: var(--font-size-meta);
        line-height: 1.5;
        color: var(--text-muted);
    }

    &__stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-3);
        margin: 0;
    }

    &__stat {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--card-radius);
        background: var(--bg-secondary);

        dt {
            color: var(--text-secondary);
            font-size: var(--font-size-meta);
            overflow-wrap: anywhere;
        }

        dd {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            line-height: 1.3;
            font-variant-numeric: tabular-nums;
            overflow-wrap: anywhere;
        }
    }

    &__users {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0 var(--space-5);
        list-style: none;
        margin: 0;
        padding: 0;

        li {
            min-width: 0;
        }

        li:nth-child(n + 3) {
            border-top: 1px solid var(--divider-subtle);
        }
    }

    &__user {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) 0;
    }

    &__user-name {
        font-weight: 600;
    }

    &__user-bio {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        margin-top: var(--space-1);
    }

    &__quote {
        blockquote {
            margin: 0;
            color: var(--text-secondary);
            font-size: var(--font-size-control);
            line-height: 1.85;
            overflow-wrap: anywhere;
        }

        footer {
            margin-top: var(--space-2);
            font-size: var(--font-size-meta);
            color: var(--text-muted);
        }
    }
}

@media (max-width: 767px) {
    .home__intro,
    .home__side,
    .home__users {
        grid-template-columns: minmax(0, 1fr);
    }

    .home__users li:nth-child(2) {
        border-top: 1px solid var(--divider-subtle);
    }
}
</style>
