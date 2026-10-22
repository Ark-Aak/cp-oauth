<template>
    <!-- eslint-disable-next-line vue/no-v-html -- output of the sanitizing Markdown pipeline -->
    <div v-if="html" class="cp-prose" v-html="html" />
    <p v-else-if="pending" class="cp-help">{{ t('common.states.loading') }}</p>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ source: string; autolink?: boolean }>(), {
    autolink: true
});
const { t } = useI18n();

const { data: html, pending } = await useAsyncData(
    `cp-md-${useId()}`,
    async () => {
        if (!props.source.trim()) return '';
        const { renderMarkdown } = await import('~/utils/markdown');
        return renderMarkdown(props.source, { autolinkLiterals: props.autolink });
    },
    { watch: [() => props.source, () => props.autolink] }
);
</script>
