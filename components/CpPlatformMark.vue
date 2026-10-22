<template>
    <span class="cp-platform" :class="{ 'cp-platform--icon-only': !label }">
        <img
            class="cp-platform__mark"
            :src="`/icons/${icon}.svg`"
            :width="size"
            :height="size"
            alt=""
            aria-hidden="true"
            loading="lazy"
        />
        <span v-if="label" class="cp-platform__name">{{ PLATFORMS[platform].name }}</span>
        <span v-else class="cp-sr-only">{{ PLATFORMS[platform].name }}</span>
    </span>
</template>

<script setup lang="ts">
import { PLATFORMS, type Platform } from '~/utils/platforms';

const props = withDefaults(defineProps<{ platform: Platform; label?: boolean; size?: number }>(), {
    label: true,
    size: 16
});

const icon = computed(() =>
    props.platform === 'codeforces' ? 'codeforces-tricolor' : props.platform
);
</script>

<style scoped lang="scss">
.cp-platform {
    display: inline-flex;
    align-items: center;
    gap: var(--cp-space-2);
    min-width: 0;
    color: var(--cp-text);
}

.cp-platform__mark {
    flex: none;
    object-fit: contain;
}

/* Monochrome marks need a light backing to stay visible on dark surfaces. */
html.dark .cp-platform__mark[src$='github.svg'],
html.dark .cp-platform__mark[src$='leetcode.svg'],
html.dark .cp-platform__mark[src$='atcoder.svg'] {
    filter: invert(1) hue-rotate(180deg);
}

.cp-platform__name {
    font-weight: var(--cp-weight-medium);
    white-space: nowrap;
}
</style>
