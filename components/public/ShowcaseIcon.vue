<template>
    <span class="public-icon">
        <img
            v-if="src && !failed"
            :src="src"
            alt=""
            width="32"
            height="32"
            loading="lazy"
            referrerpolicy="no-referrer"
            @error="failed = true"
        />
        <span v-else class="public-icon__initial" aria-hidden="true">{{ initial }}</span>
    </span>
</template>

<script setup lang="ts">
const props = defineProps<{ src: string | null; name: string }>();

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
.public-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    overflow: hidden;
    background: var(--cp-sunken);
    border: 1px solid var(--cp-line);
    border-radius: var(--cp-radius-sm);

    img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
}

.public-icon__initial {
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text-3);
}
</style>
