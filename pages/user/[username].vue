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

        <!-- CP Stats -->
        <el-card v-if="user.cpStats" shadow="never" class="user-profile__section">
            <template #header>
                <span class="user-profile__section-title">{{ $t('user.cp_stats') }}</span>
            </template>
            <div v-if="user.cpStats.accounts.length">
                <div
                    v-for="account in user.cpStats.accounts"
                    :key="account.resource"
                    class="user-profile__cp-stat-item"
                >
                    <span class="user-profile__cp-resource">
                        <AppPlatformIcon :platform="account.resource" />
                        {{ account.resource_name || account.resource }}
                    </span>
                    <span class="user-profile__cp-handle">{{ account.handle }}</span>
                    <span v-if="account.rating != null" class="user-profile__cp-rating">
                        {{ $t('user.rating') }}: <strong>{{ account.rating }}</strong>
                    </span>
                    <span v-else class="user-profile__cp-rating user-profile__cp-rating--unrated">
                        {{ $t('user.rating') }}: {{ $t('user.unrated') }}
                    </span>
                    <span v-if="account.n_contests" class="user-profile__cp-contests">
                        {{ $t('user.contests') }}: {{ account.n_contests }}
                    </span>
                    <span v-if="account.resource_rank != null" class="user-profile__cp-rank">
                        {{ $t('user.rank') }}: #{{ account.resource_rank }}
                    </span>
                </div>
            </div>
            <el-empty v-else :description="$t('user.no_cp_stats')" :image-size="48" />
        </el-card>

        <!-- Rating History Chart -->
        <el-card
            v-if="user.ratingHistory && user.ratingHistory.length"
            shadow="never"
            class="user-profile__section"
        >
            <template #header>
                <span class="user-profile__section-title">{{ $t('user.rating_history') }}</span>
            </template>
            <div v-loading="!chartReady" class="user-profile__chart-container">
                <canvas ref="ratingChartCanvas" />
            </div>
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
import type { Chart } from 'chart.js';

const { t } = useI18n();
const route = useRoute();
const colorMode = useColorMode();

const username = route.params.username as string;

const platformProfileUrls: Record<string, (uid: string, uname: string | null) => string | null> = {
    luogu: uid => `https://www.luogu.com.cn/user/${uid}`,
    codeforces: (_uid, uname) => (uname ? `https://codeforces.com/profile/${uname}` : null),
    atcoder: (_uid, uname) => (uname ? `https://atcoder.jp/users/${uname}` : null),
    github: (_uid, uname) => (uname ? `https://github.com/${uname}` : null),
    clist: (_uid, uname) => (uname ? `https://clist.by/coder/${uname}/` : null)
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

interface CpStatAccount {
    resource: string;
    resource_name?: string;
    handle: string;
    rating: number | null;
    n_contests: number;
    resource_rank: number | null;
    last_activity: string | null;
}

interface RatingHistoryEntry {
    resource: string;
    resource_name?: string;
    contest_id: number;
    event: string;
    date: string;
    handle: string;
    place: number | null;
    old_rating: number | null;
    new_rating: number | null;
    rating_change: number | null;
}

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
    cpStats?: {
        accounts: CpStatAccount[];
        highest_rating: { resource: string; handle: string; rating: number | null } | null;
        total_contests: number;
    };
    ratingHistory?: RatingHistoryEntry[];
}

const { data: user, error } = await useFetch<UserProfile>(`/api/users/${username}`);

const renderedHtml = ref('');
const cpPlatforms = new Set(['luogu', 'codeforces', 'atcoder']);
const refreshablePlatforms = new Set(['luogu', 'codeforces', 'github', 'clist']);
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
        } else if (err.statusCode === 409) {
            ElMessage.warning(err.data?.message || t('binding.refresh_rebind_required'));
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

// --- Rating History Chart (Chart.js) ---
const ratingChartCanvas = ref<HTMLCanvasElement | null>(null);
const chartReady = ref(false);

const RESOURCE_COLORS: Record<string, string> = {
    'codeforces.com': '#1890ff',
    'atcoder.jp': '#52c41a',
    'atcoder.jp/heuristic': '#a0d911',
    'luogu.com.cn': '#fa541c'
};

let chartInstance: InstanceType<typeof Chart> | null = null;

async function initRatingChart() {
    chartReady.value = false;
    const canvas = ratingChartCanvas.value;
    const entries = user.value?.ratingHistory;
    if (!canvas || !entries || entries.length === 0) return;

    const {
        Chart,
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        TimeScale,
        Tooltip,
        Legend,
        Filler
    } = await import('chart.js');
    const { default: adapter } = await import('chart.js/auto');
    // Register with a single auto import fallback
    void adapter;

    Chart.register(
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        TimeScale,
        Tooltip,
        Legend,
        Filler
    );

    // Sort all entries by date
    const sorted = [...entries].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Group by resource
    const groups: Record<string, RatingHistoryEntry[]> = {};
    const resourceDisplayNames: Record<string, string> = {};
    for (const entry of sorted) {
        const key = entry.resource;
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry);
        if (entry.resource_name) {
            resourceDisplayNames[key] = entry.resource_name;
        }
    }

    const isDark = currentTheme.value === 'dark';
    const textColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

    const datasets = Object.keys(groups).map(resource => {
        const data = groups[resource];
        const color = RESOURCE_COLORS[resource] || '#888';
        return {
            label: resourceDisplayNames[resource] || resource,
            data: data
                .filter(e => e.new_rating !== null)
                .map(e => ({
                    x: new Date(e.date).getTime(),
                    y: e.new_rating as number,
                    _entry: e
                })),
            borderColor: color,
            backgroundColor: color + '20',
            pointBackgroundColor: color,
            pointBorderColor: color,
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2,
            tension: 0.1,
            fill: false
        };
    });

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    chartInstance = new Chart(canvas, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: true
            },
            scales: {
                x: {
                    type: 'linear',
                    ticks: {
                        color: textColor,
                        font: { size: 10 },
                        callback(value) {
                            const d = new Date(value as number);
                            return d.toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short'
                            });
                        },
                        maxTicksLimit: 8
                    },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: {
                        color: textColor,
                        font: { size: 11 },
                        callback(value) {
                            return String(Math.round(value as number));
                        }
                    },
                    grid: { color: gridColor }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: isDark ? '#1f1f2e' : '#fff',
                    titleColor: isDark ? '#e0e0e0' : '#333',
                    bodyColor: isDark ? '#ccc' : '#555',
                    borderColor: isDark ? '#444' : '#ddd',
                    borderWidth: 1,
                    cornerRadius: 6,
                    padding: 10,
                    displayColors: true,
                    callbacks: {
                        title(items) {
                            const raw = items[0]?.raw as {
                                _entry?: RatingHistoryEntry;
                            };
                            return raw?._entry?.event || '';
                        },
                        afterTitle(items) {
                            const raw = items[0]?.raw as {
                                _entry?: RatingHistoryEntry;
                            };
                            if (!raw?._entry) return '';
                            const d = new Date(raw._entry.date);
                            return d.toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                            });
                        },
                        label(item) {
                            const raw = item.raw as { _entry?: RatingHistoryEntry };
                            const e = raw?._entry;
                            if (!e) return '';
                            const parts = [`Rating: ${e.new_rating}`];
                            if (e.rating_change !== null && e.rating_change !== undefined) {
                                const sign = e.rating_change >= 0 ? '+' : '';
                                parts.push(`(${sign}${e.rating_change})`);
                            }
                            return parts.join(' ');
                        },
                        afterLabel(item) {
                            const raw = item.raw as { _entry?: RatingHistoryEntry };
                            const e = raw?._entry;
                            if (!e || !e.place) return '';
                            return `#${e.place}`;
                        }
                    }
                }
            }
        }
    });

    chartReady.value = true;
}

onMounted(() => {
    nextTick(() => initRatingChart());
});

watch(currentTheme, () => nextTick(() => initRatingChart()));

onBeforeUnmount(() => {
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
});

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

    &__cp-stat-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 7px 0;
        font-size: 13px;
        flex-wrap: wrap;

        & + & {
            border-top: 1px solid var(--border-color);
        }
    }

    &__cp-resource {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        color: var(--text-primary);
        min-width: 120px;
    }

    &__cp-handle {
        color: var(--text-secondary);
        min-width: 80px;
    }

    &__cp-rating {
        color: var(--text-primary);

        strong {
            font-weight: 700;
        }

        &--unrated {
            color: var(--text-muted);
            font-style: italic;
        }
    }

    &__cp-contests,
    &__cp-rank {
        color: var(--text-muted);
        font-size: 12px;
    }

    &__chart-container {
        position: relative;
        width: 100%;
        height: 320px;

        canvas {
            display: block;
            width: 100%;
            height: 100%;
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
