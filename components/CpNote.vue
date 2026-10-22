<template>
    <div class="cp-note" :class="`cp-note--${tone}`" :role="tone === 'danger' ? 'alert' : 'status'">
        <component
            :is="icon"
            class="cp-note__icon"
            :size="16"
            :stroke-width="1.75"
            aria-hidden="true"
        />
        <div class="cp-note__body">
            <p v-if="title" class="cp-note__title">{{ title }}</p>
            <div class="cp-note__text"><slot /></div>
        </div>
        <div v-if="$slots.actions" class="cp-note__actions"><slot name="actions" /></div>
    </div>
</template>

<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-vue-next';

const props = withDefaults(
    defineProps<{ tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string }>(),
    { tone: 'info', title: undefined }
);

const icon = computed(
    () =>
        ({ info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert })[
            props.tone
        ]
);
</script>

<style scoped lang="scss">
.cp-note {
    display: flex;
    align-items: flex-start;
    gap: var(--cp-space-3);
    padding: var(--cp-space-3) var(--cp-space-4);
    background: var(--soft);
    border: 1px solid color-mix(in srgb, var(--tone) 35%, transparent);
    border-radius: var(--cp-radius-sm);
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-text);
}

.cp-note__icon {
    flex: none;
    margin-top: 2px;
    color: var(--tone);
}

.cp-note__body {
    flex: 1;
    min-width: 0;
}

.cp-note__title {
    font-weight: var(--cp-weight-strong);
}

.cp-note__text {
    color: var(--cp-text-2);
    overflow-wrap: anywhere;
}

.cp-note__title + .cp-note__text {
    margin-top: 2px;
}

.cp-note__actions {
    flex: none;
    align-self: center;
}

.cp-note--info {
    --tone: var(--cp-accent);
    --soft: var(--cp-accent-soft);
}

.cp-note--success {
    --tone: var(--cp-success);
    --soft: var(--cp-success-soft);
}

.cp-note--warning {
    --tone: var(--cp-warning);
    --soft: var(--cp-warning-soft);
}

.cp-note--danger {
    --tone: var(--cp-danger);
    --soft: var(--cp-danger-soft);
}
</style>
