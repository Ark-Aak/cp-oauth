<template>
    <span
        class="cp-avatar"
        :style="{
            width: `${size}px`,
            height: `${size}px`,
            fontSize: `${Math.round(size * 0.42)}px`
        }"
    >
        <img
            v-if="src && !failed"
            :src="src"
            :alt="alt ?? ''"
            :width="size"
            :height="size"
            loading="lazy"
            referrerpolicy="no-referrer"
            @error="failed = true"
        />
        <span v-else class="cp-avatar__initial" aria-hidden="true">{{ initial }}</span>
    </span>
</template>

<script setup lang="ts">
const props = withDefaults(
    defineProps<{ src?: string | null; name: string; size?: number; alt?: string }>(),
    { src: null, size: 40, alt: undefined }
);

const failed = ref(false);
watch(
    () => props.src,
    () => {
        failed.value = false;
    }
);

const initial = computed(() => Array.from(props.name.trim())[0]?.toUpperCase() ?? '?');
</script>

<style scoped lang="scss">
.cp-avatar {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: var(--cp-radius-sm);
    background: var(--cp-accent-soft);
    color: var(--cp-accent);
    box-shadow: inset 0 0 0 1px var(--cp-line);

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
}

.cp-avatar__initial {
    font-family: var(--cp-font-mono);
    font-weight: var(--cp-weight-medium);
    line-height: 1;
}
</style>
