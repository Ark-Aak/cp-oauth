<template>
    <div class="empty-state">
        <component
            :is="icon || Inbox"
            class="empty-state__icon"
            :size="18"
            :stroke-width="1.5"
            aria-hidden="true"
        />
        <slot
            ><p>{{ text }}</p></slot
        >
    </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { Inbox } from 'lucide-vue-next';

defineProps<{ text?: string; icon?: Component }>();
</script>

<style scoped lang="scss">
.empty-state {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--space-3) 0;
    color: var(--text-secondary);
    text-align: left;
    font-size: var(--font-size-control);
    line-height: 1.6;
    overflow-wrap: anywhere;

    &__icon {
        flex-shrink: 0;
        color: var(--text-muted);
    }

    :deep(p) {
        margin: 0;
        max-width: 100%;
    }
}
</style>
