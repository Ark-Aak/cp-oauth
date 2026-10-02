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
const { locale } = useI18n();
const config = useRuntimeConfig();
const analyticsToken = config.public.cloudflareAnalyticsToken.trim();

const loadingIndicatorColor = computed(() =>
    colorMode.value === 'dark' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(0, 0, 0, 0.92)'
);

useHead(() => ({
    htmlAttrs: {
        lang: locale.value === 'zh' ? 'zh-CN' : locale.value === 'ja' ? 'ja' : 'en'
    },
    script: [
        {
            key: 'website-json-ld',
            type: 'application/ld+json',
            innerHTML: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: 'CP OAuth',
                url: new URL('/', config.public.siteOrigin).href
            })
        },
        ...(analyticsToken
            ? [
                  {
                      key: 'cloudflare-web-analytics',
                      defer: true,
                      src: 'https://static.cloudflareinsights.com/beacon.min.js',
                      'data-cf-beacon': JSON.stringify({ token: analyticsToken })
                  }
              ]
            : [])
    ]
}));
</script>
