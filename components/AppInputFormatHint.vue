<template>
    <div class="input-format-hint" :data-format="format">
        <FileCode2 :size="18" aria-hidden="true" />
        <div>
            <strong>{{ $t(`input_format.${format}.label`) }}</strong>
            <p>{{ $t(`input_format.${format}.description`) }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { FileCode2 } from 'lucide-vue-next';

defineProps<{ format: 'markdown' | 'html' }>();
</script>

<style scoped lang="scss">
.input-format-hint {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    margin: var(--space-2) 0 var(--space-3);
    padding: var(--space-3);
    border-left: 3px solid var(--accent);
    border-radius: 4px;
    background: var(--accent-subtle);
    color: var(--text-primary);
    font-size: 14px;
    line-height: 1.6;
    overflow-wrap: anywhere;

    svg {
        flex-shrink: 0;
        margin-top: 2px;
        color: var(--accent);
    }

    p {
        margin: 4px 0 0;
        color: var(--text-secondary);
    }
}
</style>
