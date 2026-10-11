<template>
    <nav class="admin-section-nav ui-card" :aria-label="$t('admin.title')">
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
    min-width: 0;
    padding: var(--space-1);
    overflow-x: auto;

    &__link {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        height: 32px;
        padding: 0 var(--space-3);
        border-radius: var(--card-radius);
        font-size: var(--font-size-control);
        color: var(--text-secondary);
        text-decoration: none;
        white-space: nowrap;

        &:hover {
            background: var(--bg-secondary);
        }

        &--current {
            background: var(--accent-subtle);
            color: var(--accent);
            font-weight: 600;
        }
    }
}
</style>
