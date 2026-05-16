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
            key: 'website-json-ld',
            type: 'application/ld+json',
            innerHTML: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: 'CP OAuth',
                url: 'https://www.cpoauth.com/'
            })
        },
        {
            key: 'cloudflare-web-analytics',
            defer: true,
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': '{"token": "c2d855fe9c6947b29c73141ce9d31d8b"}'
        }
    ]
});
</script>
