<template>
    <span class="cp-code" :class="{ 'cp-code--block': block }">
        <code class="cp-code__value" :title="block || secret ? undefined : value">{{ shown }}</code>
        <span class="cp-code__tools">
            <button
                v-if="secret"
                type="button"
                class="cp-code__button"
                :aria-label="revealed ? t('common.actions.hide') : t('common.actions.reveal')"
                :title="revealed ? t('common.actions.hide') : t('common.actions.reveal')"
                @click="revealed = !revealed"
            >
                <EyeOff v-if="revealed" :size="14" aria-hidden="true" />
                <Eye v-else :size="14" aria-hidden="true" />
            </button>
            <button
                v-if="copy"
                type="button"
                class="cp-code__button"
                :aria-label="copied ? t('common.actions.copied') : t('common.actions.copy')"
                :title="copied ? t('common.actions.copied') : t('common.actions.copy')"
                @click="copyValue"
            >
                <Check v-if="copied" :size="14" aria-hidden="true" />
                <Copy v-else :size="14" aria-hidden="true" />
            </button>
        </span>
        <span class="cp-sr-only" aria-live="polite">{{
            copied ? t('common.actions.copied') : ''
        }}</span>
    </span>
</template>

<script setup lang="ts">
import { Check, Copy, Eye, EyeOff } from 'lucide-vue-next';

const props = withDefaults(
    defineProps<{ value: string; copy?: boolean; secret?: boolean; block?: boolean }>(),
    { copy: true, secret: false, block: false }
);

const { t } = useI18n();
const revealed = ref(false);
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

const shown = computed(() =>
    props.secret && !revealed.value ? '•'.repeat(Math.min(props.value.length, 24)) : props.value
);

async function copyValue() {
    try {
        await navigator.clipboard.writeText(props.value);
        copied.value = true;
        clearTimeout(timer);
        timer = setTimeout(() => {
            copied.value = false;
        }, 1600);
    } catch {
        ElMessage.error(t('common.errors.clipboard'));
    }
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<style scoped lang="scss">
.cp-code {
    display: inline-flex;
    align-items: center;
    gap: var(--cp-space-1);
    max-width: 100%;
    min-width: 0;
    padding: 1px var(--cp-space-1) 1px var(--cp-space-2);
    background: var(--cp-sunken);
    border: 1px solid var(--cp-line);
    border-radius: var(--cp-radius-sm);
    vertical-align: middle;
}

.cp-code__value {
    min-width: 0;
    overflow: hidden;
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-text);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.cp-code--block {
    display: flex;
    align-items: flex-start;
    width: 100%;
    padding: var(--cp-space-3) var(--cp-space-2) var(--cp-space-3) var(--cp-space-4);

    .cp-code__value {
        flex: 1;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }
}

.cp-code__tools {
    display: inline-flex;
    flex: none;
}

.cp-code__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--cp-text-3);
    background: transparent;
    border: 0;
    border-radius: var(--cp-radius-sm);
    cursor: pointer;
    transition:
        color var(--cp-duration) var(--cp-ease),
        background-color var(--cp-duration) var(--cp-ease);

    &:hover {
        color: var(--cp-text);
        background: var(--cp-line);
    }
}
</style>
