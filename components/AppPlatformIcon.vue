<template>
    <img :src="iconSrc" :alt="platform" class="platform-icon" loading="lazy" />
</template>

<script setup lang="ts">
const props = defineProps<{
    platform: string;
}>();

const baseUrl = computed(() => {
    const configured = useRuntimeConfig().app.baseURL || '/';
    return configured.endsWith('/') ? configured : `${configured}/`;
});

// Map Clist resource domains to local platform names for icon lookup
const RESOURCE_TO_ICON: Record<string, string> = {
    'codeforces.com': 'codeforces',
    'atcoder.jp': 'atcoder',
    'atcoder.jp/heuristic': 'atcoder',
    'luogu.com.cn': 'luogu',
    'github.com': 'github',
    'google.com': 'google',
    'clist.by': 'clist'
};

const resolved = computed(() => {
    return RESOURCE_TO_ICON[props.platform] || props.platform;
});

const iconSrc = computed(() => {
    const p = resolved.value;
    if (p === 'atcoder') {
        return `${baseUrl.value}icons/atcoder.svg`;
    }
    if (p === 'codeforces') {
        return `${baseUrl.value}icons/codeforces-tricolor.svg`;
    }
    if (p === 'clist') {
        return `${baseUrl.value}icons/clist.svg`;
    }
    if (p === 'github') {
        return `${baseUrl.value}icons/github.svg`;
    }
    if (p === 'google') {
        return `${baseUrl.value}icons/google.svg`;
    }
    if (p === 'luogu') {
        return `${baseUrl.value}icons/luogu.svg`;
    }
    // Fallback: try simpleicons by domain name (strip TLD)
    const name = props.platform.replace(/\..+$/, '');
    return `https://cdn.simpleicons.org/${name}`;
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
