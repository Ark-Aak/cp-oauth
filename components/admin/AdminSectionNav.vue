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
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border-color);

    &__link {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: var(--space-2) var(--space-4);
        border-radius: var(--card-radius);
        border-bottom: 2px solid transparent;
        font-size: var(--font-size-control);
        color: var(--text-secondary);
        text-decoration: none;
        overflow-wrap: anywhere;

        &:hover {
            color: var(--accent);
            background: var(--bg-tertiary);
        }

        &--current {
            background: var(--accent-subtle);
            color: var(--accent);
            border-bottom-color: var(--accent);
            font-weight: 600;
        }
    }
}

@media (max-width: 479px) {
    .admin-section-nav {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-1);
    }
}
</style>
