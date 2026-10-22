<template>
    <section
        class="cp-sheet"
        :class="{ 'cp-sheet--danger': tone === 'danger', 'cp-sheet--flush': flush }"
        :aria-labelledby="title ? headingId : undefined"
    >
        <header v-if="title || $slots.actions" class="cp-sheet__head">
            <div class="cp-sheet__heading">
                <h2 v-if="title" :id="headingId" class="cp-sheet__title">{{ title }}</h2>
                <p v-if="description" class="cp-sheet__description">{{ description }}</p>
            </div>
            <div v-if="$slots.actions" class="cp-sheet__actions"><slot name="actions" /></div>
        </header>
        <div class="cp-sheet__body"><slot /></div>
        <footer v-if="$slots.footer" class="cp-sheet__foot"><slot name="footer" /></footer>
    </section>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        title?: string;
        description?: string;
        tone?: 'default' | 'danger';
        flush?: boolean;
    }>(),
    { title: undefined, description: undefined, tone: 'default', flush: false }
);

const headingId = useId();
</script>

<style scoped lang="scss">
.cp-sheet {
    min-width: 0;
    background: var(--cp-surface);
    border: 1px solid var(--cp-line);
    border-radius: var(--cp-radius-md);
}

.cp-sheet--danger {
    border-color: color-mix(in srgb, var(--cp-danger) 40%, var(--cp-line));
}

.cp-sheet__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cp-space-4);
    padding: var(--cp-space-4) var(--cp-space-5);
    border-bottom: 1px solid var(--cp-line);
}

.cp-sheet__heading {
    min-width: 0;
}

.cp-sheet__title {
    font-size: var(--cp-text-lg);
    line-height: var(--cp-leading-lg);
    font-weight: var(--cp-weight-strong);
    color: var(--cp-text);
}

.cp-sheet--danger .cp-sheet__title {
    color: var(--cp-danger);
}

.cp-sheet__description {
    margin-top: 2px;
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-text-3);
}

.cp-sheet__actions {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--cp-space-2);
    justify-content: flex-end;

    :deep(.el-button + .el-button) {
        margin-left: 0;
    }
}

.cp-sheet__body {
    padding: var(--cp-space-5);
}

.cp-sheet--flush .cp-sheet__body {
    padding: 0;
}

.cp-sheet__foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--cp-space-2);
    padding: var(--cp-space-3) var(--cp-space-5);
    background: var(--cp-sunken);
    border-top: 1px solid var(--cp-line);
    border-radius: 0 0 var(--cp-radius-md) var(--cp-radius-md);

    :deep(.el-button + .el-button) {
        margin-left: 0;
    }
}

@media (max-width: 767px) {
    .cp-sheet__head {
        flex-direction: column;
        padding: var(--cp-space-4);
    }

    .cp-sheet__actions {
        justify-content: flex-start;
    }

    .cp-sheet__body {
        padding: var(--cp-space-4);
    }

    .cp-sheet__foot {
        padding: var(--cp-space-3) var(--cp-space-4);
    }
}
</style>
