<template>
    <ProfileBasic v-if="tab === 'basic'" />
    <ProfileSecurity v-else-if="tab === 'security'" />
    <ProfileBindings v-else-if="tab === 'bindings'" />
    <ProfileApps v-else-if="tab === 'apps'" />
    <ProfilePrivacy v-else />
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' });

const TABS = ['basic', 'security', 'bindings', 'apps', 'privacy'] as const;
type ProfileTab = (typeof TABS)[number];

const { t } = useI18n();
const route = useRoute();

/** The rail selects the section through `?tab=`; unknown values fall back to `basic`. */
const tab = computed<ProfileTab>(() => {
    const value = route.query.tab;
    return typeof value === 'string' && (TABS as readonly string[]).includes(value)
        ? (value as ProfileTab)
        : 'basic';
});

const titles: Record<ProfileTab, string> = {
    basic: 'common.nav.profile',
    security: 'common.nav.security',
    bindings: 'common.nav.bindings',
    apps: 'common.nav.apps',
    privacy: 'common.nav.privacy'
};

useHead(() => ({ title: t(titles[tab.value]) }));
</script>
