<template>
    <div>
        <NuxtLayout>
            <NuxtPage />
        </NuxtLayout>
    </div>
</template>

<script setup lang="ts">
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
