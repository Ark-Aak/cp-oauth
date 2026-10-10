<template>
    <footer class="app-footer">
        <div class="app-footer__content">
            <p class="app-footer__text">
                {{ $t('app.footer.repo') }}:
                <a
                    class="app-footer__link"
                    href="https://github.com/Ark-Aak/cp-oauth"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Ark-Aak/cp-oauth
                </a>
            </p>
            <span class="app-footer__separator" aria-hidden="true">·</span>
            <p class="app-footer__text">
                {{ $t('app.footer.developer') }}:
                <a
                    class="app-footer__link"
                    href="https://www.luogu.com.cn/user/381949"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Federico2903
                </a>
            </p>
            <span class="app-footer__separator" aria-hidden="true">·</span>
            <a
                class="app-footer__link"
                :href="
                    promotionSource === 'oauth'
                        ? 'https://www.rainyun.com/federico_?s=oauth'
                        : 'https://www.rainyun.com/federico_'
                "
                target="_blank"
                rel="noopener noreferrer"
            >
                {{ $t('app.footer.compute_service') }}
            </a>
        </div>
    </footer>
</template>

<script setup lang="ts">
defineProps<{ promotionSource?: 'oauth' }>();
</script>

<style scoped lang="scss">
.app-footer {
    margin-top: var(--space-4);
    padding: var(--space-2) 0 var(--space-1);
    border-top: 1px solid var(--border-color);
    color: var(--text-muted);
    font-size: var(--font-size-meta);

    &__content {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0 var(--space-3);
        width: 100%;
        min-width: 0;
        max-width: var(--footer-content-width, 100%);
        margin-inline: auto;
    }

    &__link,
    &__link:hover {
        display: inline-flex;
        align-items: center;
        min-width: 44px;
        min-height: 44px;
        max-width: 100%;
        color: var(--text-primary);
        text-decoration: none;
        overflow-wrap: anywhere;
    }

    &__link:hover {
        text-decoration: underline;
    }

    &__separator {
        color: var(--text-muted);
    }

    &__text {
        margin: 0;
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-1);
        min-width: 0;
        max-width: 100%;
    }
}
@media (max-width: 767px) {
    .app-footer__separator {
        display: none;
    }
}
</style>
