<template>
    <el-avatar
        ref="avatar"
        class="app-user-avatar"
        :size="size"
        :src="imageFailed ? undefined : normalizedSrc"
        :alt="name || undefined"
        :aria-label="name || undefined"
        role="img"
        @error="imageFailed = true"
    >
        <svg class="app-user-avatar__hash" viewBox="0 0 7 7" aria-hidden="true">
            <path :d="identiconPath" fill="currentColor" />
        </svg>
    </el-avatar>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue';

const props = withDefaults(
    defineProps<{
        size?: number | 'small' | 'default' | 'large';
        src?: string | null;
        name?: string | null;
        seed?: string;
    }>(),
    {
        size: 40,
        src: null,
        name: null,
        seed: ''
    }
);

const avatar = ref<ComponentPublicInstance | null>(null);
const imageFailed = ref(false);
const normalizedSrc = computed(() => props.src?.trim() || undefined);
watch(normalizedSrc, () => {
    imageFailed.value = false;
});
onMounted(() => {
    // SSR images can fail before Vue attaches the image error handler.
    const image = avatar.value?.$el.querySelector('img') as HTMLImageElement | null;
    if (image?.complete && image.naturalWidth === 0) imageFailed.value = true;
});
const identiconPath = computed(() => {
    const seed = props.seed || props.name?.trim() || '?';
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
        hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
    }
    let path = '';
    for (let row = 0; row < 5; row++) {
        for (let column = 0; column < 3; column++) {
            if ((hash >>> (row * 3 + column)) & 1) {
                path += `M${column + 1} ${row + 1}h1v1h-1z`;
                if (column < 2) path += `M${5 - column} ${row + 1}h1v1h-1z`;
            }
        }
    }
    return path || 'M3 3h1v1h-1z';
});
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

    &__hash {
        display: block;
        width: 100%;
        height: 100%;
        shape-rendering: crispEdges;
    }
}
</style>
