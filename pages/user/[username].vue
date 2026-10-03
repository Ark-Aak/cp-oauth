<template>
    <div class="user-profile">
        <template v-if="user">
            <header class="user-profile__identity">
                <AppUserAvatar
                    :size="64"
                    :src="user.avatarUrl || undefined"
                    :name="user.displayName || user.username"
                />
                <div class="user-profile__identity-text">
                    <AppPageHeader
                        :title="user.displayName || user.username"
                        :description="`@${user.username}`"
                    />
                    <p v-if="user.bio" class="user-profile__bio">{{ user.bio }}</p>
                    <p class="user-profile__joined">
                        {{ $t('user.joined') }}
                        <time :datetime="user.createdAt">
                            {{
                                formatCSTTime(user.createdAt, {
                                    dateOnly: true,
                                    withTimezone: true
                                })
                            }}
                        </time>
                    </p>
                </div>
            </header>

            <div class="user-profile__content">
                <section
                    v-if="user.homepage"
                    class="user-profile__section"
                    aria-labelledby="public-homepage"
                >
                    <h2 id="public-homepage">{{ $t('user.homepage') }}</h2>
                    <AppAsyncState
                        :pending="markdownStatus === 'pending'"
                        :error="markdownError ? $t('markdown.render_error') : null"
                        @retry="retryMarkdown()"
                    >
                        <div class="user-profile__markdown" v-html="renderedHtml" />
                    </AppAsyncState>
                    <pre v-if="markdownError" class="user-profile__markdown-source">{{
                        homepageSource
                    }}</pre>
                </section>

                <section
                    v-if="user.publicCpStats"
                    class="user-profile__section"
                    aria-labelledby="public-cp-stats"
                >
                    <h2 id="public-cp-stats">{{ $t('user.cp_stats') }}</h2>
                    <AppAsyncState
                        :pending="statsPending"
                        :error="
                            statsError || user.cpStatsStatus === 'unavailable'
                                ? $t('identity.network_error')
                                : null
                        "
                        :empty="
                            user.cpStatsStatus === 'available' && !user.cpStats?.accounts.length
                        "
                        :empty-text="$t('user.no_cp_stats')"
                        :empty-icon="ChartNoAxesCombined"
                        @retry="refreshStats()"
                    >
                        <ul v-if="user.cpStats" class="user-profile__stats">
                            <li
                                v-for="account in user.cpStats.accounts"
                                :key="`${account.resource}:${account.handle}`"
                                class="user-profile__stat"
                            >
                                <div class="user-profile__stat-identity">
                                    <span class="user-profile__resource">
                                        <AppPlatformIcon :platform="account.resource" />
                                        {{ account.resource_name || account.resource }}
                                    </span>
                                    <span class="user-profile__stat-handle">{{
                                        account.handle
                                    }}</span>
                                </div>
                                <dl class="user-profile__stat-values">
                                    <div>
                                        <dt>{{ $t('user.rating') }}</dt>
                                        <dd>{{ account.rating ?? $t('user.unrated') }}</dd>
                                    </div>
                                    <div>
                                        <dt>{{ $t('user.contests') }}</dt>
                                        <dd>{{ account.n_contests }}</dd>
                                    </div>
                                    <div v-if="account.resource_rank != null">
                                        <dt>{{ $t('user.rank') }}</dt>
                                        <dd>#{{ account.resource_rank }}</dd>
                                    </div>
                                </dl>
                            </li>
                        </ul>
                    </AppAsyncState>
                </section>

                <section class="user-profile__section" aria-labelledby="public-accounts">
                    <h2 id="public-accounts">{{ $t('profile.public_accounts') }}</h2>
                    <div class="user-profile__accounts">
                        <div class="user-profile__account-group">
                            <h3>{{ $t('user.linked_accounts') }}</h3>
                            <AppAsyncState
                                :pending="false"
                                :empty="!cpLinkedAccounts.length"
                                :empty-text="$t('user.no_linked')"
                                :empty-icon="Link2"
                            >
                                <UserPublicLinkedAccounts :accounts="cpLinkedAccounts" />
                            </AppAsyncState>
                        </div>
                        <div class="user-profile__account-group">
                            <h3>{{ $t('user.other_accounts') }}</h3>
                            <AppAsyncState
                                :pending="false"
                                :empty="!otherLinkedAccounts.length"
                                :empty-text="$t('user.no_other_accounts')"
                                :empty-icon="Link2"
                            >
                                <UserPublicLinkedAccounts :accounts="otherLinkedAccounts" />
                            </AppAsyncState>
                        </div>
                    </div>
                </section>

                <section
                    v-if="showRatingHistory"
                    class="user-profile__section"
                    aria-labelledby="public-rating-history"
                >
                    <h2 id="public-rating-history">{{ $t('user.rating_history') }}</h2>
                    <AppAsyncState
                        :pending="statsPending"
                        :error="
                            statsError || user.ratingHistoryStatus === 'unavailable'
                                ? $t('identity.network_error')
                                : null
                        "
                        :empty="
                            user.ratingHistoryStatus === 'available' && !user.ratingHistory?.length
                        "
                        :empty-text="$t('user.no_rating_history')"
                        :empty-icon="ChartNoAxesCombined"
                        @retry="refreshStats()"
                    >
                        <ClientOnly v-if="user.ratingHistory?.length">
                            <UserRatingHistoryChart :history="user.ratingHistory" />
                            <template #fallback
                                ><p role="status">{{ $t('user.loading') }}</p></template
                            >
                        </ClientOnly>
                    </AppAsyncState>
                </section>
            </div>
        </template>
        <template v-else>
            <AppPageHeader :title="`@${username}`" />
            <AppAsyncState
                :pending="!error"
                :error="error && !isNotFound ? $t('identity.network_error') : null"
                :empty="isNotFound"
                :empty-text="$t('user.not_found')"
                :empty-icon="UserRoundSearch"
                @retry="refreshProfile()"
            />
        </template>
    </div>
</template>

<script setup lang="ts">
import { ChartNoAxesCombined, Link2, UserRoundSearch } from 'lucide-vue-next';
import { renderMarkdown } from '~/utils/markdown';
import { formatCSTTime } from '~/utils/time';
import { normalizeUsername } from '~/utils/username';
import type { PublicProfileResponse, PublicProfileStats } from '~/types/public-profile';

const route = useRoute();
const api = useApi();
const username = computed(() => normalizeUsername(route.params.username));
const {
    data: fetchedUser,
    error,
    refresh: refreshProfile
} = await useAsyncData(
    () => `public-user:${username.value}`,
    (_nuxtApp, { signal }) =>
        api<PublicProfileResponse>(
            `/api/users/${encodeURIComponent(username.value)}?includeStats=false`,
            { signal }
        ),
    { dedupe: 'cancel' }
);

const stats = shallowRef<PublicProfileStats | null>(null);
const statsUsername = ref('');
const statsPending = ref(true);
const statsError = ref(false);
let statsRequest = 0;
let statsController: AbortController | null = null;
let mounted = false;

const user = computed(() => {
    const base = fetchedUser.value;
    if (!base || normalizeUsername(base.username) !== username.value) return null;
    return { ...base, ...(statsUsername.value === username.value ? stats.value : {}) };
});
const isNotFound = computed(() => error.value?.statusCode === 404);

async function refreshStats(): Promise<void> {
    if (!mounted || !user.value) return;
    const request = ++statsRequest;
    const sourceUsername = username.value;
    statsController?.abort();
    stats.value = null;
    statsUsername.value = '';
    statsError.value = false;
    if (!user.value.publicCpStats && !user.value.publicRatingHistory) {
        statsPending.value = false;
        return;
    }
    const controller = new AbortController();
    statsController = controller;
    statsPending.value = true;
    try {
        const value = await api<PublicProfileStats>(
            `/api/users/${encodeURIComponent(sourceUsername)}/stats`,
            { signal: controller.signal }
        );
        if (request !== statsRequest || username.value !== sourceUsername) return;
        stats.value = value;
        statsUsername.value = sourceUsername;
    } catch {
        if (request === statsRequest && !controller.signal.aborted) statsError.value = true;
    } finally {
        if (request === statsRequest) {
            statsPending.value = false;
            statsController = null;
        }
    }
}

watch(
    username,
    () => {
        statsRequest += 1;
        statsController?.abort();
        statsController = null;
        stats.value = null;
        statsUsername.value = '';
        statsError.value = false;
        statsPending.value = true;
    },
    { flush: 'sync' }
);
watch(fetchedUser, () => {
    if (mounted) void refreshStats();
});
onMounted(() => {
    mounted = true;
    void refreshStats();
});
onBeforeUnmount(() => {
    mounted = false;
    statsRequest += 1;
    statsController?.abort();
});

useHead({
    title: () =>
        `${user.value?.displayName || user.value?.username || `@${username.value}`} - CP OAuth`
});

const cpPlatforms: Record<string, true> = {
    luogu: true,
    codeforces: true,
    atcoder: true,
    leetcode: true
};
const cpLinkedAccounts = computed(
    () =>
        user.value?.linkedAccounts.filter(account =>
            Object.hasOwn(cpPlatforms, account.platform)
        ) || []
);
const otherLinkedAccounts = computed(
    () =>
        user.value?.linkedAccounts.filter(
            account => !Object.hasOwn(cpPlatforms, account.platform)
        ) || []
);
const showRatingHistory = computed(() =>
    Boolean(
        user.value?.publicRatingHistory &&
        (statsPending.value || statsError.value || user.value.ratingHistoryStatus)
    )
);

const homepageSource = computed(() => user.value?.homepage || '');
let markdownRequest = 0;

watch(
    [username, homepageSource],
    () => {
        markdownRequest += 1;
    },
    { flush: 'sync' }
);
onScopeDispose(() => {
    markdownRequest += 1;
});

const {
    data: renderedMarkdown,
    error: markdownError,
    status: markdownStatus,
    refresh: retryMarkdown
} = await useAsyncData(
    () => `user-markdown:${username.value}`,
    async (_nuxtApp, { signal }) => {
        const request = ++markdownRequest;
        const sourceUsername = username.value;
        const source = homepageSource.value;
        const html = source ? await renderMarkdown(source) : '';

        if (signal.aborted || request !== markdownRequest) {
            throw new DOMException('Markdown request was superseded.', 'AbortError');
        }

        return { username: sourceUsername, source, html };
    },
    { watch: [homepageSource], dedupe: 'cancel' }
);

const renderedHtml = computed(() =>
    renderedMarkdown.value?.username === username.value &&
    renderedMarkdown.value.source === homepageSource.value
        ? renderedMarkdown.value.html
        : ''
);
</script>

<style scoped lang="scss">
.user-profile {
    min-width: 0;

    &__identity {
        display: flex;
        align-items: flex-start;
        gap: var(--space-4);
        margin-bottom: var(--space-6);
    }

    &__identity-text {
        min-width: 0;
        flex: 1;
        overflow-wrap: anywhere;

        :deep(.page-header) {
            margin-bottom: var(--space-3);
        }
    }

    &__bio {
        color: var(--text-secondary);
        white-space: pre-wrap;
    }

    &__joined {
        font-size: 14px;
        color: var(--text-muted);
        margin-top: var(--space-2);
    }

    &__content {
        min-width: 0;
    }

    &__section {
        min-width: 0;
        padding: var(--space-5) 0;
        border-top: 1px solid var(--border-color);

        h2 {
            margin-bottom: var(--space-4);
        }
    }

    &__accounts {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-6);
    }

    &__account-group {
        min-width: 0;

        h3 {
            margin-bottom: var(--space-3);
            color: var(--text-secondary);
        }
    }

    &__stats {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    &__stat {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4) var(--space-6);
        padding: var(--space-4) 0;

        & + & {
            border-top: 1px solid var(--border-color);
        }
    }

    &__stat-identity {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    &__resource {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-weight: 600;
    }

    &__stat-handle {
        font-size: 14px;
        color: var(--text-secondary);
    }

    &__stat-values {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-4) var(--space-6);
        margin: 0;

        dt {
            font-size: 14px;
            color: var(--text-muted);
        }

        dd {
            margin: 0;
            font-weight: 600;
        }
    }

    &__markdown-source {
        margin-top: var(--space-4);
        padding: var(--space-4);
        border: 1px solid var(--border-color);
        border-radius: var(--card-radius);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    &__markdown {
        min-width: 0;
        overflow-wrap: anywhere;

        :deep(h2),
        :deep(h3),
        :deep(h4),
        :deep(h5),
        :deep(h6) {
            font-weight: 600;
            margin: var(--space-5) 0 var(--space-2);
        }

        :deep(p) {
            margin-bottom: var(--space-3);
        }

        :deep(code) {
            font-size: 14px;
            background: var(--bg-tertiary);
            padding: var(--space-1);
            border-radius: var(--card-radius);
        }

        :deep(pre) {
            max-width: 100%;
            border: 1px solid var(--border-color);
            border-radius: var(--card-radius);
            padding: var(--space-4);
            overflow-x: auto;
            margin-bottom: var(--space-4);
            font-size: 14px;

            code {
                background: none;
                padding: 0;
            }
        }

        :deep(ul),
        :deep(ol) {
            padding-left: var(--space-5);
            margin-bottom: var(--space-3);
        }

        :deep(li) {
            margin-bottom: var(--space-1);
        }

        :deep(blockquote) {
            margin: 0 0 var(--space-3);
            border-left: 2px solid var(--border-color);
            padding-left: var(--space-4);
            color: var(--text-secondary);
        }

        :deep(img) {
            max-width: 100%;
            height: auto;
            border-radius: var(--card-radius);
        }

        :deep(hr) {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: var(--space-5) 0;
        }

        :deep(table) {
            display: block;
            max-width: 100%;
            overflow-x: auto;
            border-collapse: collapse;
            margin-bottom: var(--space-4);

            th,
            td {
                border: 1px solid var(--border-color);
                padding: var(--space-2) var(--space-3);
                text-align: left;
            }

            th {
                font-weight: 600;
                background: var(--bg-tertiary);
            }
        }
    }
}

@media (max-width: 767px) {
    .user-profile__accounts {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 479px) {
    .user-profile__identity {
        flex-direction: column;
    }
}
</style>
