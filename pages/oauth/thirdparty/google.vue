<template>
    <OAuthCallbackFlow provider="google" />
</template>

<script setup lang="ts">
import OAuthCallbackFlow from '~/components/oauth/OAuthCallbackFlow.vue';

definePageMeta({ layout: 'auth' });
</script>
