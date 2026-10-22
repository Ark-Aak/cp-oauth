<template>
    <div class="cp-field">
        <dt class="cp-field__label">{{ label }}</dt>
        <dd class="cp-field__value" :class="{ 'cp-mono': mono }"><slot /></dd>
    </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label: string; mono?: boolean }>(), { mono: false });
</script>

<style scoped lang="scss">
.cp-field {
    display: grid;
    grid-template-columns: minmax(120px, 200px) minmax(0, 1fr);
    gap: var(--cp-space-4);
    align-items: baseline;
    padding: var(--cp-space-3) 0;
    border-bottom: 1px solid var(--cp-line);

    &:first-child {
        padding-top: 0;
    }

    &:last-child {
        padding-bottom: 0;
        border-bottom: 0;
    }
}

.cp-field__label {
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-text-3);
}

.cp-field__value {
    min-width: 0;
    color: var(--cp-text);
    overflow-wrap: anywhere;
}

@media (max-width: 767px) {
    .cp-field {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--cp-space-1);
    }
}
</style>
