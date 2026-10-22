<template>
    <div class="overview">
        <section class="overview__lead" aria-labelledby="overview-title">
            <p class="cp-kicker">{{ t('common.nav.explore') }}</p>
            <h1 id="overview-title" class="overview__title">{{ t('public.home.title') }}</h1>
            <p class="overview__statement">{{ t('public.home.statement') }}</p>
            <div class="overview__actions">
                <template v-if="user">
                    <el-button type="primary" @click="navigateTo('/profile')">
                        {{ t('public.home.openProfile') }}
                    </el-button>
                    <el-button @click="navigateTo('/developer')">
                        {{ t('public.home.openDeveloper') }}
                    </el-button>
                </template>
                <template v-else>
                    <el-button type="primary" @click="navigateTo('/login')">
                        {{ t('common.actions.signIn') }}
                    </el-button>
                    <el-button v-if="config.registrationEnabled" @click="navigateTo('/register')">
                        {{ t('common.actions.createAccount') }}
                    </el-button>
                </template>
                <NuxtLink to="/about" class="overview__more">{{
                    t('public.home.howItWorks')
                }}</NuxtLink>
            </div>
            <figure v-if="quote" class="overview__quote">
                <blockquote>{{ quote.text }}</blockquote>
                <figcaption>
                    — {{ [quote.fromWho, quote.source].filter(Boolean).join(' · ') }}
                </figcaption>
            </figure>
        </section>

        <section class="overview__figures" :aria-label="t('public.home.figures')">
            <dl v-if="stats" class="overview__ledger">
                <div v-for="item in figures" :key="item.key" class="overview__figure">
                    <dt>{{ item.label }}</dt>
                    <dd class="cp-num">{{ number(item.value) }}</dd>
                </div>
            </dl>
            <p v-else class="cp-help">{{ t('public.home.figuresUnavailable') }}</p>
        </section>

        <CpSheet :title="t('public.home.notices')" flush class="overview__notices">
            <CpDataState
                :pending="noticesPending"
                :error="noticesError ? describe(noticesError) : null"
                :empty="!notices?.length"
                :empty-text="t('public.home.noNotices')"
                @retry="refreshNotices"
            >
                <ul class="overview__notice-list">
                    <li v-for="notice in notices" :key="notice.id" class="overview__notice">
                        <div class="overview__notice-head">
                            <h3 class="overview__notice-title">{{ notice.title }}</h3>
                            <CpStatus
                                v-if="notice.pinned"
                                tone="accent"
                                :label="t('public.home.pinned')"
                            />
                            <time class="overview__notice-date" :datetime="notice.publishedAt">
                                {{ date(notice.publishedAt) }}
                            </time>
                        </div>
                        <!-- eslint-disable-next-line vue/no-v-html -- sanitized by the server allow-list -->
                        <div class="cp-prose overview__notice-body" v-html="notice.content" />
                    </li>
                </ul>
            </CpDataState>
        </CpSheet>

        <CpSheet :title="t('public.home.members')" flush class="overview__members">
            <CpDataState
                :pending="membersPending"
                :error="membersError ? describe(membersError) : null"
                :empty="!members?.length"
                :empty-text="t('public.home.noMembers')"
                @retry="refreshMembers"
            >
                <ul class="cp-rows">
                    <li v-for="member in members" :key="member.id">
                        <CpAvatar
                            :src="member.avatarUrl"
                            :name="member.displayName || member.username"
                            :size="32"
                        />
                        <div class="cp-rows__main">
                            <NuxtLink :to="`/user/${member.username}`" class="cp-rows__title">
                                {{ member.displayName || member.username }}
                            </NuxtLink>
                            <span class="cp-rows__meta cp-mono">@{{ member.username }}</span>
                        </div>
                        <time class="cp-rows__meta" :datetime="member.createdAt">
                            {{ t('public.home.joined', { date: date(member.createdAt) }) }}
                        </time>
                    </li>
                </ul>
            </CpDataState>
        </CpSheet>
    </div>
</template>

<script setup lang="ts">
import type { NoticeSummary, QuoteSummary, SiteStatsResponse, UserSummary } from '~/types/api';

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();
const { date, number } = useFormat();
const { user } = useSession();
const { config } = usePublicConfig();

useHead({ title: t('common.nav.home') });

const [statsResult, noticesResult, membersResult, quoteResult] = await Promise.all([
    useAsyncData('home-stats', () => api<SiteStatsResponse>('/api/public/stats').catch(() => null)),
    useAsyncData('home-notices', () => api<NoticeSummary[]>('/api/public/notices')),
    useAsyncData('home-members', () =>
        api<UserSummary[]>('/api/users', { query: { limit: config.value.recentUsersCount } })
    ),
    useAsyncData('home-quote', () => api<QuoteSummary>('/api/public/hitokoto').catch(() => null))
]);

const stats = statsResult.data;
const quote = quoteResult.data;
const {
    data: notices,
    pending: noticesPending,
    error: noticesError,
    refresh: refreshNotices
} = noticesResult;
const {
    data: members,
    pending: membersPending,
    error: membersError,
    refresh: refreshMembers
} = membersResult;

const figures = computed(() =>
    stats.value
        ? [
              { key: 'users', label: t('public.home.stats.users'), value: stats.value.users },
              {
                  key: 'linked',
                  label: t('public.home.stats.linkedAccounts'),
                  value: stats.value.linkedAccounts
              },
              {
                  key: 'clients',
                  label: t('public.home.stats.oauthClients'),
                  value: stats.value.oauthClients
              },
              {
                  key: 'today',
                  label: t('public.home.stats.signInsToday'),
                  value: stats.value.oauthLoginRequestsToday
              }
          ]
        : []
);
</script>

<style scoped lang="scss">
.overview {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: var(--cp-space-8) var(--cp-space-6);
    align-items: start;
}

.overview__lead {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
    padding-bottom: var(--cp-space-6);
    border-bottom: 1px solid var(--cp-line-strong);
}

.overview__title {
    font-size: var(--cp-text-display);
    line-height: var(--cp-leading-display);
    font-weight: var(--cp-weight-strong);
    color: var(--cp-text);
}

.overview__statement {
    max-width: 60ch;
    font-size: var(--cp-text-lg);
    line-height: var(--cp-leading-lg);
    color: var(--cp-text-2);
}

.overview__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cp-space-2) var(--cp-space-3);

    .el-button + .el-button {
        margin-left: 0;
    }
}

.overview__more {
    font-size: var(--cp-text-sm);
}

.overview__quote {
    max-width: 60ch;
    padding-left: var(--cp-space-4);
    border-left: 2px solid var(--cp-line-strong);

    blockquote {
        margin: 0;
        color: var(--cp-text-2);
    }

    figcaption {
        margin-top: var(--cp-space-1);
        font-size: var(--cp-text-sm);
        color: var(--cp-text-3);
    }
}

.overview__figures {
    border-top: 1px solid var(--cp-line-strong);
}

.overview__ledger {
    display: flex;
    flex-direction: column;
}

.overview__figure {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--cp-space-4);
    padding: var(--cp-space-3) 0;
    border-bottom: 1px solid var(--cp-line);

    dt {
        font-size: var(--cp-text-sm);
        color: var(--cp-text-3);
    }

    dd {
        font-size: var(--cp-text-figure);
        line-height: var(--cp-leading-figure);
        font-weight: var(--cp-weight-medium);
        color: var(--cp-text);
    }
}

.overview__figures > .cp-help {
    padding: var(--cp-space-3) 0;
}

.overview__notice-list {
    display: flex;
    flex-direction: column;
}

.overview__notice {
    padding: var(--cp-space-4) var(--cp-space-5);
    border-bottom: 1px solid var(--cp-line);

    &:last-child {
        border-bottom: 0;
    }
}

.overview__notice-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--cp-space-2) var(--cp-space-3);
}

.overview__notice-title {
    font-size: var(--cp-text-md);
    font-weight: var(--cp-weight-strong);
    color: var(--cp-text);
}

.overview__notice-date {
    margin-left: auto;
    font-size: var(--cp-text-sm);
    color: var(--cp-text-3);
}

.overview__notice-body {
    margin-top: var(--cp-space-2);
}

.overview :deep(.cp-state) {
    padding: var(--cp-space-4) var(--cp-space-5);
}

@media (max-width: 1279px) {
    .overview {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 767px) {
    .overview__title {
        font-size: var(--cp-text-2xl);
        line-height: var(--cp-leading-2xl);
    }
}
</style>
