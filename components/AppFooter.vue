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
                href="https://github.com/Federico2903"
                target="_blank"
                rel="noopener noreferrer"
            >
                Federico2903
            </a>
        </p>
    </footer>
</template>

<style scoped lang="scss">
.app-footer {
    margin-top: 20px;
    padding: 16px 0 4px;
    border-top: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-muted);
    font-size: 12px;
    flex-wrap: wrap;

    &__link {
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
    }
}
</style>
