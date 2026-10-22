<template>
    <div class="rating-chart">
        <div v-if="resources.length > 1" class="rating-chart__filter">
            <el-segmented
                v-model="selected"
                :options="resources"
                size="small"
                :aria-label="t('public.user.chartResource')"
            />
        </div>
        <div class="rating-chart__canvas">
            <canvas ref="canvas" role="img" :aria-label="t('public.user.chartLabel')" />
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    CategoryScale,
    Chart,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    Tooltip,
    type TooltipItem
} from 'chart.js';
import type { RatingHistoryItem } from '~/types/api';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

const props = defineProps<{ history: RatingHistoryItem[] }>();

const { t } = useI18n();
const colorMode = useColorMode();
const { date, signed, number } = useFormat();
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart<'line'> | null = null;

const rated = computed(() =>
    props.history
        .filter(item => typeof item.new_rating === 'number')
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
);

const resources = computed(() => {
    const seen = new Map<string, string>();
    for (const item of rated.value) seen.set(item.resource, item.resource_name || item.resource);
    return [...seen].map(([value, label]) => ({ value, label }));
});

const selected = ref('');
watch(
    resources,
    list => {
        if (!list.some(item => item.value === selected.value))
            selected.value = list[0]?.value ?? '';
    },
    { immediate: true }
);

const points = computed(() => rated.value.filter(item => item.resource === selected.value));

function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw() {
    if (!canvas.value) return;
    chart?.destroy();
    const accent = cssVar('--cp-accent');
    const line = cssVar('--cp-line');
    const muted = cssVar('--cp-text-3');
    const mono = cssVar('--cp-font-mono');
    const items = points.value;
    chart = new Chart(canvas.value, {
        type: 'line',
        data: {
            labels: items.map(item => date(item.date)),
            datasets: [
                {
                    data: items.map(item => item.new_rating as number),
                    borderColor: accent,
                    backgroundColor: accent,
                    borderWidth: 1.5,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', intersect: false },
            scales: {
                x: {
                    grid: { color: line },
                    border: { color: line },
                    ticks: { color: muted, font: { family: mono, size: 12 }, maxTicksLimit: 6 }
                },
                y: {
                    grid: { color: line },
                    border: { color: line },
                    ticks: { color: muted, font: { family: mono, size: 12 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (context: TooltipItem<'line'>[]) =>
                            items[context[0]?.dataIndex ?? 0]?.event ?? '',
                        label: (context: TooltipItem<'line'>) => {
                            const item = items[context.dataIndex];
                            if (!item) return '';
                            return t('public.user.chartTooltip', {
                                date: date(item.date),
                                rating: number(item.new_rating),
                                change: signed(item.rating_change)
                            });
                        }
                    }
                }
            }
        }
    });
}

onMounted(draw);
watch([points, () => colorMode.value], () => nextTick(draw));
onBeforeUnmount(() => chart?.destroy());
</script>

<style scoped lang="scss">
.rating-chart__filter {
    margin-bottom: var(--cp-space-3);
}

.rating-chart__canvas {
    position: relative;
    height: 240px;
}
</style>
