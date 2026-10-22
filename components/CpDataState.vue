<template>
    <div v-if="pending" class="cp-state cp-state--pending" role="status" aria-busy="true">
        <span class="cp-sr-only">{{ t('common.states.loading') }}</span>
        <span v-for="index in rows" :key="index" class="cp-state__bar" aria-hidden="true" />
    </div>
    <div v-else-if="error" class="cp-state cp-state--error" role="alert">
        <p>{{ error }}</p>
        <el-button size="small" @click="emit('retry')">{{ t('common.actions.retry') }}</el-button>
    </div>
    <div v-else-if="empty" class="cp-state cp-state--empty">
        <slot name="empty">
            <p>{{ emptyText ?? t('common.states.empty') }}</p>
        </slot>
    </div>
    <slot v-else />
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        pending: boolean;
        error?: string | null;
        empty?: boolean;
        emptyText?: string;
        rows?: number;
    }>(),
    { error: null, empty: false, emptyText: undefined, rows: 3 }
);
const emit = defineEmits<{ retry: [] }>();
const { t } = useI18n();
</script>

<style scoped lang="scss">
.cp-state {
    padding: var(--cp-space-5);
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-text-3);
}

.cp-state--pending {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-3);
}

.cp-state__bar {
    height: 12px;
    background: linear-gradient(90deg, var(--cp-sunken), var(--cp-line), var(--cp-sunken));
    background-size: 200% 100%;
    border-radius: 2px;
    animation: cp-shimmer 1.4s ease-in-out infinite;

    &:nth-child(3n + 2) {
        width: 72%;
    }

    &:nth-child(3n + 3) {
        width: 48%;
    }
}

.cp-state--error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--cp-space-3);
    color: var(--cp-danger);
}

.cp-state--empty {
    text-align: left;
}

@keyframes cp-shimmer {
    from {
        background-position: 100% 0;
    }

    to {
        background-position: -100% 0;
    }
}
</style>
