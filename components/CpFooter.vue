<template>
    <footer class="cp-footer">
        <p class="cp-footer__line">
            <span class="cp-mono">{{ config.siteTitle }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ t('common.footer.tagline') }}</span>
        </p>
        <nav class="cp-footer__links" :aria-label="t('common.footer.label')">
            <NuxtLink to="/about">{{ t('common.nav.about') }}</NuxtLink>
            <NuxtLink to="/showcase">{{ t('common.nav.showcase') }}</NuxtLink>
            <a href="/.well-known/openid-configuration" target="_blank" rel="noopener">
                {{ t('common.footer.discovery') }}
            </a>
            <a href="https://github.com/Mr-Python-in-China/cp-oauth" target="_blank" rel="noopener">
                {{ t('common.footer.source') }}
            </a>
        </nav>
    </footer>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { config } = usePublicConfig();
</script>

<style scoped lang="scss">
.cp-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--cp-space-3) var(--cp-space-6);
    padding: var(--cp-space-5) 0;
    margin-top: var(--cp-space-12);
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-text-3);
    border-top: 1px solid var(--cp-line);
}

.cp-footer__line {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cp-space-2);
}

.cp-footer__links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cp-space-4);

    a {
        color: var(--cp-text-3);

        &:hover {
            color: var(--cp-text);
        }
    }
}
</style>
