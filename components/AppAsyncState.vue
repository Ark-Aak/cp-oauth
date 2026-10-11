<template>
    <section :aria-busy="pending" class="async-state">
        <div v-if="pending" class="async-state__loading" role="status">
            <el-skeleton :rows="3" animated />
            <span class="sr-only">{{ $t('user.loading') }}</span>
        </div>
        <div v-else-if="error" class="async-state__message ui-note ui-note--danger" role="alert">
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

    &__message {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;

        p {
            margin: 0;
        }
    }

    &__loading {
        padding: var(--space-4);
    }
}
</style>
