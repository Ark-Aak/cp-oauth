<template>
    <el-avatar class="app-user-avatar" :size="size" :src="normalizedSrc">
        <span class="app-user-avatar__fallback">{{ initial }}</span>
    </el-avatar>
</template>

<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        size?: number | string;
        src?: string | null;
        name?: string | null;
    }>(),
    {
        size: 40,
        src: null,
        name: null
    }
);

const normalizedSrc = computed(() => props.src?.trim() || undefined);
const initial = computed(() => (props.name?.trim() || '?').charAt(0).toUpperCase());
</script>

<style scoped lang="scss">
.app-user-avatar {
    flex-shrink: 0;
    background: var(--accent-subtle);
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--card-border));
    font-weight: 600;

    :deep(img) {
        display: block;
    }

    &__fallback {
        line-height: 1;
    }
}
</style>
