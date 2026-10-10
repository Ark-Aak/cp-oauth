<template>
    <div class="empty-state">
        <component
            :is="icon || Inbox"
            class="empty-state__icon"
            :size="32"
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
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    min-width: 0;
    min-height: 128px;
    padding: var(--space-5);
    color: var(--text-secondary);
    text-align: center;
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
