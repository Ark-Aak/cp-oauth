<template>
    <footer class="app-footer">
        <a
            class="app-footer__link"
            href="https://github.com/Ark-Aak/cp-oauth"
            target="_blank"
            rel="noopener noreferrer"
        >
            {{ $t('app.footer.repo') }}: Ark-Aak/cp-oauth
        </a>
        <span class="app-footer__separator">·</span>
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
        <span class="app-footer__separator">·</span>
        <a
            class="app-footer__link"
            href="https://www.rainyun.com/federico_"
            target="_blank"
            rel="noopener noreferrer"
        >
            {{ $t('app.footer.compute_service') }}
        </a>
    </footer>
</template>

<style scoped lang="scss">
.app-footer {
    margin-top: var(--space-4);
    padding: var(--space-2) 0 var(--space-1);
    border-top: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 0 var(--space-3);
    color: var(--text-muted);
    font-size: var(--font-size-meta);
    flex-wrap: wrap;

    &__link {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        color: var(--text-secondary);
        text-decoration: none;

        &:hover {
            color: var(--text-primary);
            text-decoration: underline;
        }
    }

    &__separator {
        color: var(--text-muted);
    }

    &__text {
        margin: 0;
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
    }
}
@media (max-width: 767px) {
    .app-footer__separator {
        display: none;
    }
}
</style>
