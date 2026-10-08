<template>
    <header class="page-header">
        <div class="page-header__text">
            <h1>
                <component :is="icon" v-if="icon" :size="24" :stroke-width="1.6" aria-hidden="true" />
                <span>{{ title }}</span>
            </h1>
            <p v-if="description">{{ description }}</p>
        </div>
        <div v-if="$slots.actions" class="page-header__actions"><slot name="actions" /></div>
    </header>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
defineProps<{ title: string; description?: string; icon?: Component }>();
</script>

<style scoped lang="scss">
.page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-5);
    margin-bottom: var(--space-5);
    &__text {
        min-width: 0;
    }
    h1 {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin: 0;
        font-size: var(--font-size-title);
        line-height: 1.3;
        font-weight: 700;
        letter-spacing: -0.025em;
        overflow-wrap: anywhere;

        svg {
            flex-shrink: 0;
            color: var(--text-secondary);
        }
    }
    p {
        margin-top: var(--space-2);
        color: var(--text-secondary);
        max-width: 64ch;
        font-size: var(--font-size-body);
    }
    &__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        flex-shrink: 0;
        align-items: center;
        max-width: 100%;
    }
    &__actions :deep(.el-button + .el-button) {
        margin-left: 0;
    }
}
@media (max-width: 767px) {
    .page-header {
        flex-direction: column;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
        h1 {
            font-size: var(--font-size-title-mobile);
        }
    }
}
</style>
