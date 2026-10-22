<template>
    <header class="cp-page-header">
        <div class="cp-page-header__text">
            <p v-if="kicker" class="cp-kicker">{{ kicker }}</p>
            <h1 class="cp-page-header__title">{{ title }}</h1>
            <p v-if="description" class="cp-page-header__description">{{ description }}</p>
            <slot />
        </div>
        <div v-if="$slots.actions" class="cp-page-header__actions"><slot name="actions" /></div>
    </header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title: string; kicker?: string; description?: string }>(), {
    kicker: undefined,
    description: undefined
});
</script>

<style scoped lang="scss">
.cp-page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--cp-space-6);
    padding-bottom: var(--cp-space-5);
    margin-bottom: var(--cp-space-6);
    border-bottom: 1px solid var(--cp-line-strong);
}

.cp-page-header__text {
    min-width: 0;
}

.cp-page-header__title {
    margin-top: var(--cp-space-1);
    font-size: var(--cp-text-2xl);
    line-height: var(--cp-leading-2xl);
    font-weight: var(--cp-weight-strong);
    color: var(--cp-text);
    overflow-wrap: anywhere;
}

.cp-page-header__description {
    max-width: 68ch;
    margin-top: var(--cp-space-2);
    color: var(--cp-text-2);
}

.cp-page-header__actions {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--cp-space-2);

    :deep(.el-button + .el-button) {
        margin-left: 0;
    }
}

@media (max-width: 767px) {
    .cp-page-header {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--cp-space-4);
    }

    .cp-page-header__title {
        font-size: 20px;
        line-height: 28px;
    }
}
</style>
