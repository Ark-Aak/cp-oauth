<template>
    <section class="cp-auth" :aria-labelledby="headingId">
        <header class="cp-auth__head">
            <p v-if="step" class="cp-kicker">{{ step }}</p>
            <h1 :id="headingId" class="cp-auth__title">
                <component
                    :is="icon"
                    v-if="icon"
                    :class="`cp-auth__icon cp-auth__icon--${tone}`"
                    :size="22"
                    :stroke-width="1.75"
                    aria-hidden="true"
                />
                {{ title }}
            </h1>
            <p v-if="description" class="cp-auth__description">{{ description }}</p>
        </header>

        <div class="cp-auth__body"><slot /></div>

        <div v-if="$slots.alternatives" class="cp-auth__alternatives">
            <p class="cp-auth__divider">
                <span>{{ alternativesLabel ?? t('common.states.or') }}</span>
            </p>
            <slot name="alternatives" />
        </div>

        <footer v-if="$slots.footer" class="cp-auth__foot"><slot name="footer" /></footer>
    </section>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        title: string;
        description?: string;
        step?: string;
        icon?: unknown;
        tone?: 'accent' | 'success' | 'warning' | 'danger';
        alternativesLabel?: string;
    }>(),
    {
        description: undefined,
        step: undefined,
        icon: undefined,
        tone: 'accent',
        alternativesLabel: undefined
    }
);
const { t } = useI18n();
const headingId = useId();
</script>

<style scoped lang="scss">
.cp-auth__title {
    display: flex;
    align-items: center;
    gap: var(--cp-space-3);
    margin-top: var(--cp-space-1);
    font-size: var(--cp-text-2xl);
    line-height: var(--cp-leading-2xl);
    font-weight: var(--cp-weight-strong);
    color: var(--cp-text);
}

.cp-auth__icon {
    flex: none;
}

.cp-auth__icon--accent {
    color: var(--cp-accent);
}

.cp-auth__icon--success {
    color: var(--cp-success);
}

.cp-auth__icon--warning {
    color: var(--cp-warning);
}

.cp-auth__icon--danger {
    color: var(--cp-danger);
}

.cp-auth__description {
    margin-top: var(--cp-space-2);
    color: var(--cp-text-2);
}

.cp-auth__body {
    margin-top: var(--cp-space-6);
}

.cp-auth__alternatives {
    margin-top: var(--cp-space-6);
}

.cp-auth__divider {
    display: flex;
    align-items: center;
    gap: var(--cp-space-3);
    margin-bottom: var(--cp-space-4);
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-xs);
    line-height: var(--cp-leading-xs);
    letter-spacing: var(--cp-tracking-kicker);
    text-transform: uppercase;
    color: var(--cp-text-3);

    &::before,
    &::after {
        flex: 1;
        height: 1px;
        content: '';
        background: var(--cp-line);
    }
}

.cp-auth__foot {
    padding-top: var(--cp-space-5);
    margin-top: var(--cp-space-6);
    font-size: var(--cp-text-sm);
    color: var(--cp-text-3);
    border-top: 1px solid var(--cp-line);
}
</style>
