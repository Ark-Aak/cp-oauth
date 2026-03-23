<template>
    <img :src="iconSrc" :alt="platform" class="platform-icon" loading="lazy" />
</template>

<script setup lang="ts">
const props = defineProps<{
    platform: 'luogu' | 'codeforces' | 'github';
}>();

const baseUrl = computed(() => {
    const configured = useRuntimeConfig().app.baseURL || '/';
    return configured.endsWith('/') ? configured : `${configured}/`;
});

const iconSrc = computed(() => {
    if (props.platform === 'codeforces') {
        return `${baseUrl.value}icons/codeforces-tricolor.svg`;
    }
    if (props.platform === 'github') {
        return 'https://cdn.simpleicons.org/github/24292f';
    }
    return 'https://cdn.simpleicons.org/luogu/24A0ED';
});
</script>

<style scoped lang="scss">
.platform-icon {
    width: 16px;
    height: 16px;
    display: inline-block;
    flex-shrink: 0;
}
</style>
