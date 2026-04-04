<template>
    <div>
        <NuxtLoadingIndicator
            :color="loadingIndicatorColor"
            :error-color="loadingIndicatorColor"
            :height="2"
            :throttle="0"
        />
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode();

const loadingIndicatorColor = computed(() =>
    colorMode.value === 'dark' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(0, 0, 0, 0.92)'
);

useHead({
    script: [
        {
            key: 'cloudflare-web-analytics',
            defer: true,
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': '{"token": "d364edfab2ec4133b3f98feb38d9935f"}'
        }
    ]
});
</script>
