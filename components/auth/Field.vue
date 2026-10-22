<template>
    <div class="auth-field">
        <label :for="id" class="auth-field__label">
            <span>{{ label }}</span>
            <slot name="aside" />
        </label>
        <slot :id="id" />
        <p v-if="error" class="auth-field__error" role="alert">{{ error }}</p>
        <p v-else-if="hint" class="cp-help">{{ hint }}</p>
    </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; hint?: string; error?: string }>();
const id = useId();
</script>

<style scoped lang="scss">
.auth-field {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-1);
}

.auth-field__label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--cp-space-3);
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text);

    :deep(a) {
        font-weight: var(--cp-weight-regular);
    }
}

.auth-field__error {
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-danger);
}
</style>
