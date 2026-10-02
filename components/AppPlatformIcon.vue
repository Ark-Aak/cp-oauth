<template>
    <span class="platform-icon" aria-hidden="true">
        <img
            v-if="iconSrc && !failed"
            :src="iconSrc"
            alt=""
            loading="lazy"
            @error="failed = true"
        />
        <Code v-else :size="18" :stroke-width="1.6" />
    </span>
</template>

<script setup lang="ts">
import { Code } from 'lucide-vue-next';
const props = defineProps<{ platform: string }>();
const failed = ref(false);
const resourceIcons: Record<string, string> = {
    'codeforces.com': 'codeforces',
    'atcoder.jp': 'atcoder',
    'atcoder.jp/heuristic': 'atcoder',
    'luogu.com.cn': 'luogu',
    'github.com': 'github',
    'google.com': 'google',
    'clist.by': 'clist'
};
const localIcons: Record<string, string> = {
    atcoder: 'atcoder.svg',
    codeforces: 'codeforces-tricolor.svg',
    clist: 'clist.svg',
    github: 'github.svg',
    google: 'google.svg',
    luogu: 'luogu.svg'
};
const iconSrc = computed(() => {
    const name = resourceIcons[props.platform] || props.platform;
    const file = localIcons[name];
    if (!file) return null;
    const base = useRuntimeConfig().app.baseURL || '/';
    return `${base.endsWith('/') ? base : `${base}/`}icons/${file}`;
});
watch(
    () => props.platform,
    () => {
        failed.value = false;
    }
);
</script>

<style scoped lang="scss">
.platform-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: currentColor;
}
.platform-icon img {
    width: 18px;
    height: 18px;
    object-fit: contain;
}
</style>
