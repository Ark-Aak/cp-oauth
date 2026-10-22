<template>
    <div class="profile-page">
        <header class="profile-page__band">
            <CpAvatar :src="profile.avatarUrl" :name="name" :size="64" />
            <div class="profile-page__identity">
                <p class="cp-kicker">{{ t('public.user.kicker') }}</p>
                <h1 class="profile-page__name">{{ name }}</h1>
                <p class="profile-page__handle cp-mono">@{{ profile.username }}</p>
                <p v-if="profile.bio" class="profile-page__bio">{{ profile.bio }}</p>
                <p class="cp-help">
                    {{ t('public.user.joined', { date: date(profile.createdAt) }) }}
                </p>
            </div>
            <div v-if="isOwner" class="profile-page__actions">
                <el-button @click="navigateTo('/profile?tab=privacy')">
                    {{ t('public.user.editProfile') }}
                </el-button>
            </div>
        </header>

        <div class="profile-page__grid">
            <div class="cp-stack">
                <CpSheet v-if="profile.homepage" :title="t('public.user.homepage')">
                    <CpMarkdown :source="profile.homepage" />
                </CpSheet>

                <CpSheet v-if="profile.publicRatingHistory" :title="t('public.user.ratingHistory')">
                    <CpNote v-if="profile.ratingHistoryStatus === 'unavailable'" tone="warning">
                        {{ t('public.user.statsUnavailable') }}
                    </CpNote>
                    <p v-else-if="!ratedHistory.length" class="cp-help">
                        {{ t('public.user.noRatingHistory') }}
                    </p>
                    <template v-else>
                        <PublicRatingChart :history="ratedHistory" />
                        <table class="profile-page__table">
                            <caption class="cp-sr-only">
                                {{
                                    t('public.user.recentChanges')
                                }}
                            </caption>
                            <thead>
                                <tr>
                                    <th scope="col">{{ t('public.user.columns.contest') }}</th>
                                    <th scope="col">{{ t('public.user.columns.date') }}</th>
                                    <th scope="col" class="is-num">
                                        {{ t('public.user.columns.place') }}
                                    </th>
                                    <th scope="col" class="is-num">
                                        {{ t('public.user.columns.rating') }}
                                    </th>
                                    <th scope="col" class="is-num">
                                        {{ t('public.user.columns.change') }}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="item in recentChanges"
                                    :key="`${item.resource}-${item.contest_id}-${item.handle}`"
                                >
                                    <td>
                                        <span class="profile-page__event">{{ item.event }}</span>
                                        <span class="profile-page__resource">{{
                                            item.resource_name
                                        }}</span>
                                    </td>
                                    <td>{{ date(item.date) }}</td>
                                    <td class="is-num cp-num">{{ number(item.place) }}</td>
                                    <td class="is-num cp-num">{{ number(item.new_rating) }}</td>
                                    <td
                                        class="is-num cp-num"
                                        :class="deltaClass(item.rating_change)"
                                    >
                                        {{ signed(item.rating_change) }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </template>
                </CpSheet>
            </div>

            <div class="cp-stack">
                <CpSheet :title="t('public.user.linkedAccounts')" flush>
                    <ul v-if="profile.linkedAccounts.length" class="cp-rows">
                        <li v-for="account in profile.linkedAccounts" :key="account.platform">
                            <CpPlatformMark
                                :platform="account.platform"
                                :label="false"
                                :size="20"
                            />
                            <div class="cp-rows__main">
                                <span class="cp-rows__meta">{{
                                    PLATFORMS[account.platform].name
                                }}</span>
                                <a
                                    v-if="platformUrl(account)"
                                    :href="platformUrl(account)!"
                                    class="cp-rows__title cp-mono"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {{ account.platformUsername || account.platformUid }}
                                </a>
                                <span v-else class="cp-rows__title cp-mono">
                                    {{ account.platformUsername || account.platformUid }}
                                </span>
                            </div>
                        </li>
                    </ul>
                    <p v-else class="profile-page__empty">
                        {{ t('public.user.noLinkedAccounts') }}
                    </p>
                </CpSheet>

                <CpSheet v-if="profile.publicCpStats" :title="t('public.user.contestStats')">
                    <CpNote v-if="profile.cpStatsStatus === 'unavailable'" tone="warning">
                        {{ t('public.user.statsUnavailable') }}
                    </CpNote>
                    <template v-else-if="profile.cpStats">
                        <dl class="profile-page__ledger">
                            <div>
                                <dt>{{ t('public.user.highestRating') }}</dt>
                                <dd class="cp-num">
                                    {{ number(profile.cpStats.highest_rating?.rating) }}
                                </dd>
                                <dd v-if="profile.cpStats.highest_rating" class="cp-help">
                                    {{ profile.cpStats.highest_rating.resource_name }}
                                </dd>
                            </div>
                            <div>
                                <dt>{{ t('public.user.totalContests') }}</dt>
                                <dd class="cp-num">{{ number(profile.cpStats.total_contests) }}</dd>
                            </div>
                        </dl>
                        <ul v-if="profile.cpStats.accounts.length" class="profile-page__accounts">
                            <li
                                v-for="account in profile.cpStats.accounts"
                                :key="`${account.resource}-${account.handle}`"
                            >
                                <div class="profile-page__account-head">
                                    <span class="cp-rows__title">{{ account.resource_name }}</span>
                                    <span class="cp-rows__meta cp-mono">{{ account.handle }}</span>
                                </div>
                                <dl class="profile-page__account-figures">
                                    <div>
                                        <dt>{{ t('public.user.columns.rating') }}</dt>
                                        <dd class="cp-num">{{ number(account.rating) }}</dd>
                                    </div>
                                    <div>
                                        <dt>{{ t('public.user.contests') }}</dt>
                                        <dd class="cp-num">{{ number(account.n_contests) }}</dd>
                                    </div>
                                    <div>
                                        <dt>{{ t('public.user.rank') }}</dt>
                                        <dd class="cp-num">{{ number(account.resource_rank) }}</dd>
                                    </div>
                                    <div>
                                        <dt>{{ t('public.user.lastActivity') }}</dt>
                                        <dd>{{ date(account.last_activity) || '—' }}</dd>
                                    </div>
                                </dl>
                            </li>
                        </ul>
                        <p v-else class="cp-help">{{ t('public.user.noStats') }}</p>
                    </template>
                </CpSheet>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { PublicLinkedAccount } from '~/types/api';
import type { PublicProfileResponse } from '~/types/public-profile';
import { PLATFORMS } from '~/utils/platforms';

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { user } = useSession();
const { date, number, signed } = useFormat();

const username = computed(() => String(route.params.username ?? ''));

const { data, error } = await useAsyncData(
    () => `public-user-${username.value}`,
    () => api<PublicProfileResponse>(`/api/users/${encodeURIComponent(username.value)}`),
    { watch: [username] }
);

if (error.value) {
    const status = readApiError(error.value).status;
    throw createError({
        statusCode: status === 404 ? 404 : status || 500,
        statusMessage: status === 404 ? 'User not found' : 'Profile unavailable',
        fatal: true
    });
}

const profile = computed(() => data.value as PublicProfileResponse);
const name = computed(() => profile.value.displayName || profile.value.username);
const isOwner = computed(() => user.value?.id === profile.value.id);

const ratedHistory = computed(() =>
    (profile.value.ratingHistory ?? []).filter(item => typeof item.new_rating === 'number')
);
const recentChanges = computed(() =>
    ratedHistory.value
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20)
);

useHead(() => ({
    title: name.value,
    meta: profile.value.bio ? [{ name: 'description', content: profile.value.bio }] : []
}));

function platformUrl(account: PublicLinkedAccount): string | null {
    const uid = encodeURIComponent(account.platformUid);
    const handle = encodeURIComponent(account.platformUsername || account.platformUid);
    switch (account.platform) {
        case 'luogu':
            return `https://www.luogu.com.cn/user/${uid}`;
        case 'atcoder':
            return `https://atcoder.jp/users/${uid}`;
        case 'leetcode':
            return `https://leetcode.cn/u/${uid}/`;
        case 'codeforces':
            return account.platformUsername ? `https://codeforces.com/profile/${handle}` : null;
        case 'github':
            return account.platformUsername ? `https://github.com/${handle}` : null;
        case 'clist':
            return account.platformUsername ? `https://clist.by/coder/${handle}/` : null;
        default:
            return null;
    }
}

function deltaClass(value: number | null): string {
    if (typeof value !== 'number' || value === 0) return '';
    return value > 0 ? 'is-up' : 'is-down';
}
</script>

<style scoped lang="scss">
.profile-page__band {
    display: flex;
    align-items: flex-start;
    gap: var(--cp-space-5);
    padding-bottom: var(--cp-space-5);
    margin-bottom: var(--cp-space-6);
    border-bottom: 1px solid var(--cp-line-strong);
}

.profile-page__identity {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--cp-space-1);
    min-width: 0;
}

.profile-page__name {
    font-size: var(--cp-text-2xl);
    line-height: var(--cp-leading-2xl);
    font-weight: var(--cp-weight-strong);
    color: var(--cp-text);
    overflow-wrap: anywhere;
}

.profile-page__handle {
    color: var(--cp-text-3);
}

.profile-page__bio {
    max-width: 68ch;
    margin-top: var(--cp-space-2);
    color: var(--cp-text-2);
    white-space: pre-line;
}

.profile-page__actions {
    flex: none;
}

.profile-page__grid {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: var(--cp-space-5);
    align-items: start;
}

.profile-page__empty {
    padding: var(--cp-space-4) var(--cp-space-5);
    font-size: var(--cp-text-sm);
    color: var(--cp-text-3);
}

.profile-page__table {
    width: 100%;
    margin-top: var(--cp-space-5);
    border-collapse: collapse;
    font-size: var(--cp-text-sm);

    th {
        padding: var(--cp-space-2) var(--cp-space-2);
        font-family: var(--cp-font-mono);
        font-size: var(--cp-text-xs);
        font-weight: var(--cp-weight-medium);
        letter-spacing: var(--cp-tracking-kicker);
        text-transform: uppercase;
        text-align: left;
        color: var(--cp-text-3);
        border-bottom: 1px solid var(--cp-line-strong);
    }

    td {
        padding: var(--cp-space-2);
        vertical-align: top;
        border-bottom: 1px solid var(--cp-line);
        color: var(--cp-text-2);
    }

    .is-num {
        text-align: right;
        white-space: nowrap;
    }

    .is-up {
        color: var(--cp-success);
    }

    .is-down {
        color: var(--cp-danger);
    }
}

.profile-page__event {
    display: block;
    color: var(--cp-text);
}

.profile-page__resource {
    font-size: var(--cp-text-xs);
    color: var(--cp-text-3);
}

.profile-page__ledger {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cp-space-4);
    padding-bottom: var(--cp-space-4);
    border-bottom: 1px solid var(--cp-line);

    dt {
        font-size: var(--cp-text-sm);
        color: var(--cp-text-3);
    }

    dd.cp-num {
        font-size: var(--cp-text-figure);
        line-height: var(--cp-leading-figure);
        font-weight: var(--cp-weight-medium);
        color: var(--cp-text);
    }
}

.profile-page__accounts > li {
    padding: var(--cp-space-3) 0;
    border-bottom: 1px solid var(--cp-line);

    &:last-child {
        padding-bottom: 0;
        border-bottom: 0;
    }
}

.profile-page__account-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--cp-space-2);
}

.profile-page__account-figures {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--cp-space-2);
    margin-top: var(--cp-space-2);

    dt {
        font-size: var(--cp-text-xs);
        color: var(--cp-text-3);
    }

    dd {
        font-size: var(--cp-text-sm);
        color: var(--cp-text);
    }
}

@media (max-width: 1279px) {
    .profile-page__grid {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 767px) {
    .profile-page__band {
        flex-wrap: wrap;
    }

    .profile-page__name {
        font-size: var(--cp-text-xl);
        line-height: var(--cp-leading-xl);
    }

    .profile-page__account-figures {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .profile-page__table {
        display: block;
        overflow-x: auto;
    }
}
</style>
