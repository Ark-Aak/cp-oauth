<template>
    <div class="auth-shell">
        <aside class="auth-shell__panel">
            <NuxtLink to="/" class="auth-shell__brand">
                <span class="auth-shell__mark" aria-hidden="true">CP</span>
                <span>{{ config.siteTitle }}</span>
            </NuxtLink>

            <div class="auth-shell__statement">
                <p class="auth-shell__lead">{{ t('common.panel.lead') }}</p>
                <dl class="auth-shell__facts">
                    <div v-for="fact in facts" :key="fact.term">
                        <dt>{{ fact.term }}</dt>
                        <dd>{{ fact.detail }}</dd>
                    </div>
                </dl>
            </div>

            <div class="auth-shell__panel-foot">
                <CpPreferences surface="rail" />
                <NuxtLink to="/about" class="auth-shell__about">{{
                    t('common.nav.about')
                }}</NuxtLink>
            </div>
        </aside>

        <main id="main" class="auth-shell__main">
            <div class="auth-shell__content">
                <slot />
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { config } = usePublicConfig();

const facts = computed(() => [
    { term: 'OAuth 2.0', detail: t('common.panel.oauth') },
    { term: 'PKCE', detail: t('common.panel.pkce') },
    { term: 'Luogu · AtCoder · Codeforces', detail: t('common.panel.identities') }
]);
</script>

<style scoped lang="scss">
.auth-shell {
    display: grid;
    grid-template-columns: minmax(360px, 40%) minmax(0, 1fr);
    min-height: 100vh;
    background: linear-gradient(90deg, var(--cp-rail-bg) 0 max(360px, 40%), transparent 0);
}

.auth-shell__panel {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: var(--cp-space-8) var(--cp-space-10);
    color: var(--cp-rail-fg);
    background: var(--cp-rail-bg);
    border-right: 1px solid var(--cp-rail-line);
}

.auth-shell__brand {
    display: inline-flex;
    align-items: center;
    gap: var(--cp-space-3);
    font-size: var(--cp-text-lg);
    font-weight: var(--cp-weight-strong);
    color: var(--cp-rail-fg-strong);

    &:hover {
        color: var(--cp-rail-fg-strong);
        text-decoration: none;
    }

    &:focus-visible {
        outline-color: var(--cp-rail-accent);
    }
}

.auth-shell__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-xs);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-rail-bg);
    background: var(--cp-rail-accent);
    border-radius: var(--cp-radius-sm);
}

.auth-shell__statement {
    margin-top: auto;
    margin-bottom: auto;
    max-width: 440px;
}

.auth-shell__lead {
    font-size: var(--cp-text-display);
    line-height: var(--cp-leading-display);
    font-weight: var(--cp-weight-strong);
    color: var(--cp-rail-fg-strong);
}

.auth-shell__facts {
    margin-top: var(--cp-space-8);
    border-top: 1px solid var(--cp-rail-line);

    div {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 2px;
        padding: var(--cp-space-3) 0;
        border-bottom: 1px solid var(--cp-rail-line);
    }

    dt {
        font-family: var(--cp-font-mono);
        font-size: var(--cp-text-xs);
        line-height: var(--cp-leading-xs);
        font-weight: var(--cp-weight-medium);
        letter-spacing: var(--cp-tracking-kicker);
        text-transform: uppercase;
        color: var(--cp-rail-accent);
    }

    dd {
        font-size: var(--cp-text-sm);
        line-height: var(--cp-leading-sm);
    }
}

.auth-shell__panel-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--cp-space-3);
}

.auth-shell__about {
    font-size: var(--cp-text-sm);
    color: var(--cp-rail-muted);

    &:hover {
        color: var(--cp-rail-fg-strong);
    }

    &:focus-visible {
        outline-color: var(--cp-rail-accent);
    }
}

.auth-shell__main {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: var(--cp-space-10) var(--cp-space-6);
    background: var(--cp-surface);
    outline: none;
}

.auth-shell__content {
    width: 100%;
    max-width: var(--cp-auth-form-width);
}

@media (max-width: 899px) {
    .auth-shell {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto 1fr;
        background: none;
    }

    .auth-shell__panel {
        position: static;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--cp-space-3);
        height: auto;
        min-height: 64px;
        padding: var(--cp-space-3) var(--cp-space-4);
        border-right: 0;
        border-bottom: 1px solid var(--cp-rail-line);
    }

    .auth-shell__statement,
    .auth-shell__about {
        display: none;
    }

    .auth-shell__main {
        align-items: flex-start;
        padding: var(--cp-space-8) var(--cp-space-4);
    }
}
</style>
