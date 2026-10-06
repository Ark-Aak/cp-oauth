<template>
    <div ref="container" class="rating-history">
        <div class="rating-history__chart ui-card">
            <canvas ref="canvas" :aria-label="$t('user.rating_history')" role="img" />
            <p v-if="pending" role="status" class="rating-history__status">
                {{ $t('user.loading') }}
            </p>
            <div v-if="error" role="alert" class="rating-history__status">
                <p>{{ $t('identity.network_error') }}</p>
                <el-button @click="renderChart()">{{ $t('common.retry') }}</el-button>
            </div>
        </div>
        <details class="rating-history__data">
            <summary>{{ $t('user.rating_history_table') }}</summary>
            <div
                class="rating-history__table"
                tabindex="0"
                role="region"
                :aria-label="$t('user.rating_history_table')"
            >
                <table>
                    <caption>
                        {{
                            $t('user.rating_history')
                        }}
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col">{{ $t('user.history_date') }}</th>
                            <th scope="col">{{ $t('binding.platform') }}</th>
                            <th scope="col">{{ $t('user.history_contest') }}</th>
                            <th scope="col">{{ $t('user.rating') }}</th>
                            <th scope="col">{{ $t('user.history_change') }}</th>
                            <th scope="col">{{ $t('user.rank') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="entry in history"
                            :key="`${entry.resource}:${entry.contest_id}:${entry.handle}`"
                        >
                            <td>{{ formatCSTTime(entry.date, { withTimezone: true }) }}</td>
                            <td>{{ entry.resource_name }} · {{ entry.handle }}</td>
                            <th scope="row">{{ entry.event }}</th>
                            <td>{{ entry.old_rating ?? '—' }} → {{ entry.new_rating ?? '—' }}</td>
                            <td>
                                {{
                                    entry.rating_change === null
                                        ? '—'
                                        : `${entry.rating_change >= 0 ? '+' : ''}${entry.rating_change}`
                                }}
                            </td>
                            <td>{{ entry.place ?? '—' }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </details>
    </div>
</template>

<script setup lang="ts">
import type { Chart, ChartDataset, ChartOptions } from 'chart.js';
import type { RatingHistoryItem } from '~/types/api';
import { formatCSTTime } from '~/utils/time';

interface RatingPoint {
    x: number;
    y: number;
    entry: RatingHistoryItem;
}

const props = defineProps<{ history: RatingHistoryItem[] }>();
const { t } = useI18n();
const colorMode = useColorMode();
const container = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const pending = ref(false);
const error = ref(false);
let nearViewport = false;
let disposed = false;
let revision = 0;
let observer: IntersectionObserver | null = null;
let chart: Chart<'line', RatingPoint[]> | null = null;
let ChartConstructor: typeof Chart | null = null;
const pointStyles = ['circle', 'rect', 'triangle', 'rectRot'] as const;

function applyTheme(): void {
    if (!chart || !container.value) return;
    const style = getComputedStyle(container.value);
    const text = style.getPropertyValue('--text-primary').trim();
    const muted = style.getPropertyValue('--text-muted').trim();
    const border = style.getPropertyValue('--card-border').trim();
    const accent = style.getPropertyValue('--accent').trim();
    for (const dataset of chart.data.datasets) {
        dataset.borderColor = accent;
        dataset.pointBackgroundColor = accent;
        dataset.pointBorderColor = accent;
    }
    for (const scale of Object.values(chart.options.scales || {})) {
        if (!scale) continue;
        scale.ticks = { ...scale.ticks, color: muted };
        scale.grid = { ...scale.grid, color: border };
    }
    const legend = chart.options.plugins?.legend;
    if (legend) legend.labels = { ...legend.labels, color: text };
    const tooltip = chart.options.plugins?.tooltip;
    if (tooltip) {
        tooltip.backgroundColor = style.getPropertyValue('--bg-secondary').trim();
        tooltip.titleColor = text;
        tooltip.bodyColor = text;
        tooltip.borderColor = border;
    }
    chart.update('none');
}

async function renderChart(): Promise<void> {
    if (!nearViewport || disposed || !props.history.length || !canvas.value) return;
    const request = ++revision;
    pending.value = true;
    error.value = false;
    try {
        if (!ChartConstructor) {
            const module = await import('chart.js');
            if (disposed || request !== revision) return;
            module.Chart.register(
                module.LineController,
                module.LineElement,
                module.PointElement,
                module.CategoryScale,
                module.LinearScale,
                module.Tooltip,
                module.Legend
            );
            ChartConstructor = module.Chart;
        }
        if (disposed || request !== revision || !canvas.value) return;
        const groups = new Map<string, RatingHistoryItem[]>();
        for (const entry of props.history) {
            if (entry.new_rating === null) continue;
            const group = groups.get(entry.resource);
            if (group) group.push(entry);
            else groups.set(entry.resource, [entry]);
        }
        const accent = getComputedStyle(container.value!).getPropertyValue('--accent').trim();
        const datasets: ChartDataset<'line', RatingPoint[]>[] = [];
        for (const [resource, entries] of groups) {
            entries.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
            const seriesIndex = datasets.length;
            datasets.push({
                label: entries[0]?.resource_name || resource,
                data: entries.map(entry => ({
                    x: Date.parse(entry.date),
                    y: entry.new_rating!,
                    entry
                })),
                borderColor: accent,
                pointBackgroundColor: accent,
                pointBorderColor: accent,
                borderDash: seriesIndex ? [3 * (seriesIndex + 1), 4] : [],
                pointStyle: pointStyles[seriesIndex % pointStyles.length],
                pointRadius: 3,
                pointHoverRadius: 6,
                borderWidth: 2,
                tension: 0.1,
                fill: false
            });
        }
        if (chart) {
            chart.data.datasets = datasets;
            chart.update('none');
        } else {
            const options: ChartOptions<'line'> = {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'nearest', intersect: true },
                scales: {
                    x: {
                        type: 'linear',
                        ticks: {
                            callback: value => formatCSTTime(Number(value), { dateOnly: true }),
                            maxTicksLimit: 8
                        }
                    },
                    y: { ticks: { callback: value => String(Math.round(Number(value))) } }
                },
                plugins: {
                    legend: { labels: { usePointStyle: true } },
                    tooltip: {
                        borderWidth: 1,
                        callbacks: {
                            title: items =>
                                (items[0]?.raw as RatingPoint | undefined)?.entry.event || '',
                            afterTitle: items => {
                                const entry = (items[0]?.raw as RatingPoint | undefined)?.entry;
                                return entry
                                    ? formatCSTTime(entry.date, { withTimezone: true })
                                    : '';
                            },
                            label: item => {
                                const entry = (item.raw as RatingPoint).entry;
                                const change = entry.rating_change;
                                return `${t('user.rating')}: ${entry.new_rating}${
                                    change === null ? '' : ` (${change >= 0 ? '+' : ''}${change})`
                                }`;
                            },
                            afterLabel: item => {
                                const entry = (item.raw as RatingPoint).entry;
                                return entry.place === null
                                    ? ''
                                    : `${t('user.rank')}: #${entry.place}`;
                            }
                        }
                    }
                }
            };
            chart = new ChartConstructor(canvas.value, {
                type: 'line',
                data: { datasets },
                options
            });
        }
        applyTheme();
    } catch {
        if (!disposed && request === revision) error.value = true;
    } finally {
        if (!disposed && request === revision) pending.value = false;
    }
}

onMounted(() => {
    if (!container.value) return;
    observer = new IntersectionObserver(
        entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            nearViewport = true;
            observer?.disconnect();
            void renderChart();
        },
        { rootMargin: '200px' }
    );
    observer.observe(container.value);
});
watch(
    () => props.history,
    () => {
        revision += 1;
        if (!props.history.length) {
            chart?.destroy();
            chart = null;
            pending.value = false;
        } else {
            void renderChart();
        }
    }
);
watch(
    () => colorMode.value,
    () => nextTick(applyTheme)
);
onBeforeUnmount(() => {
    disposed = true;
    revision += 1;
    observer?.disconnect();
    chart?.destroy();
    chart = null;
});
</script>

<style scoped lang="scss">
.rating-history {
    min-width: 0;

    &__chart {
        position: relative;
        height: 260px;
        width: 100%;
        min-width: 0;
        padding: var(--space-3);
    }

    &__status {
        position: absolute;
        inset: var(--space-1);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--card-bg);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        text-align: center;
    }

    &__data {
        margin-top: var(--space-3);

        summary {
            min-height: 44px;
            cursor: pointer;
            padding: var(--space-2) 0;
            color: var(--accent);
            font-size: var(--font-size-control);
            overflow-wrap: anywhere;
        }
    }

    &__table {
        overflow-x: auto;
        max-width: 100%;

        table {
            border-collapse: collapse;
            width: 100%;
            font-size: var(--font-size-control);
        }

        caption {
            text-align: left;
            padding: var(--space-2) 0;
        }

        th,
        td {
            text-align: left;
            vertical-align: top;
            padding: var(--space-2) var(--space-3);
            border-bottom: 1px solid var(--card-border);
            color: var(--text-primary);
            min-width: 80px;
            overflow-wrap: anywhere;
        }
    }
}
@media (max-width: 479px) {
    .rating-history__chart {
        height: 220px;
    }
}
</style>
