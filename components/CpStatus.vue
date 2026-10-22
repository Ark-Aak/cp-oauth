<template>
    <span class="cp-status" :class="`cp-status--${tone}`">
        <span class="cp-status__marker" aria-hidden="true" />
        <span class="cp-status__label">{{ label }}</span>
    </span>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{ tone?: 'success' | 'warning' | 'danger' | 'info' | 'accent'; label: string }>(),
    { tone: 'info' }
);
</script>

<style scoped lang="scss">
.cp-status {
    display: inline-flex;
    align-items: center;
    gap: var(--cp-space-2);
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-text-2);
    white-space: nowrap;
}

.cp-status__marker {
    width: 6px;
    height: 6px;
    flex: none;
    background: var(--tone);
}

.cp-status--success {
    --tone: var(--cp-success);
}

.cp-status--warning {
    --tone: var(--cp-warning);
}

.cp-status--danger {
    --tone: var(--cp-danger);
}

.cp-status--info {
    --tone: var(--cp-text-3);
}

.cp-status--accent {
    --tone: var(--cp-accent);
}
</style>
