<template>
    <div>
        <NuxtLoadingIndicator color="var(--cp-accent)" :height="2" :throttle="0" />
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </div>
</template>

<script setup lang="ts">
const { config } = usePublicConfig();
const runtime = useRuntimeConfig();
const { localeProperties } = useI18n();
const analyticsToken = runtime.public.cloudflareAnalyticsToken.trim();

useHead(() => ({
    htmlAttrs: { lang: localeProperties.value.language ?? 'en' },
    titleTemplate: title =>
        title ? `${title} · ${config.value.siteTitle}` : config.value.siteTitle,
    link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    script: [
        {
            key: 'website-json-ld',
            type: 'application/ld+json',
            innerHTML: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: config.value.siteTitle,
                url: new URL('/', runtime.public.siteOrigin || 'http://localhost').href
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
