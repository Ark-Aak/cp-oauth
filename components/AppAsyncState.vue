<template>
    <section :aria-busy="pending" class="async-state">
        <div v-if="pending" class="async-state__loading" role="status">
            <el-skeleton :rows="3" animated />
            <span class="sr-only">{{ $t('user.loading') }}</span>
        </div>
        <div
            v-else-if="error"
            class="async-state__message async-state__message--error"
            role="alert"
        >
            <p>{{ error }}</p>
            <el-button native-type="button" @click="$emit('retry')">{{
                $t('common.retry')
            }}</el-button>
        </div>
        <div v-else-if="empty" class="async-state__empty">
            <AppEmptyState :text="emptyText" :icon="emptyIcon">
                <template v-if="$slots.empty" #default><slot name="empty" /></template>
            </AppEmptyState>
        </div>
        <slot v-else />
    </section>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
    pending: boolean;
    error?: string | null;
    empty?: boolean;
    emptyText?: string;
    emptyIcon?: Component;
}>();
defineEmits<{ retry: [] }>();
</script>

<style scoped lang="scss">
.async-state {
    min-width: 0;
}
.async-state__message {
    border: 1px solid var(--border-color);
    border-radius: var(--card-radius);
    background: var(--bg-primary);
    color: var(--text-secondary);
}
.async-state__message {
    padding: var(--space-4);
}
.async-state__message--error {
    border-left: 3px solid var(--el-color-danger);
    color: var(--text-primary);
}
.async-state__message p {
    margin-bottom: var(--space-3);
}
.async-state__message > p:last-child {
    margin-bottom: 0;
}
.async-state__loading {
    padding: var(--space-4);
}
</style>
