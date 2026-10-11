<template>
    <nav class="admin-section-nav" :aria-label="$t('admin.title')">
        <NuxtLink
            v-for="section in sections"
            :key="section.name"
            :to="section.path"
            :aria-current="current === section.name ? 'page' : undefined"
            class="admin-section-nav__link"
            :class="{ 'admin-section-nav__link--current': current === section.name }"
        >
            {{ $t(`admin.${section.name}.tab`) }}
        </NuxtLink>
    </nav>
</template>

<script setup lang="ts">
defineProps<{ current: 'users' | 'notices' | 'showcase' | 'config' }>();

const sections = [
    { name: 'users', path: '/admin' },
    { name: 'notices', path: '/admin/notices' },
    { name: 'showcase', path: '/admin/showcase' },
    { name: 'config', path: '/admin/config' }
] as const;
</script>

<style scoped lang="scss">
.admin-section-nav {
    display: flex;
    gap: var(--space-1);
    margin-bottom: var(--space-5);
    border-bottom: 1px solid var(--border-color);
    overflow-x: auto;

    &__link {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        height: 32px;
        padding: 0 var(--space-3);
        border-radius: 0;
        border-bottom: 2px solid transparent;
        background: none;
        font-size: var(--font-size-control);
        color: var(--text-secondary);
        text-decoration: none;
        white-space: nowrap;

        &:hover {
            color: var(--accent);
        }

        &--current {
            color: var(--accent);
            border-bottom-color: var(--accent);
            font-weight: 600;
        }
    }
}
</style>
