<template>
    <header class="page-header">
        <div class="page-header__text">
            <h1>{{ title }}</h1>
            <p v-if="description">{{ description }}</p>
        </div>
        <div v-if="$slots.actions" class="page-header__actions"><slot name="actions" /></div>
    </header>
</template>

<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<style scoped lang="scss">
.page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-5);
    margin-bottom: var(--space-6);
    &__text {
        min-width: 0;
    }
    h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.3;
        font-weight: 700;
        letter-spacing: -0.025em;
        overflow-wrap: anywhere;
    }
    p {
        margin-top: var(--space-2);
        color: var(--text-secondary);
        max-width: 64ch;
        font-size: 16px;
    }
    &__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        flex-shrink: 0;
    }
}
@media (max-width: 767px) {
    .page-header {
        flex-direction: column;
        gap: var(--space-4);
        h1 {
            font-size: 24px;
        }
    }
}
</style>
