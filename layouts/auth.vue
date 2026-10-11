<template>
    <div class="auth-layout" :class="{ 'auth-layout--consent': authorizationPage }">
        <a class="auth-layout__skip ui-navigation-link" href="#main-content">{{
            $t('nav.skip_content')
        }}</a>
        <AppPreferences mode="icons" class="auth-layout__preferences" />
        <main
            id="main-content"
            class="auth-layout__main"
            :tabindex="authorizationPage ? 0 : -1"
            :aria-labelledby="authorizationPage ? 'oauth-authorize-title' : undefined"
        >
            <div class="auth-layout__content">
                <NuxtLink
                    v-if="!authorizationPage"
                    to="/"
                    class="auth-layout__home ui-navigation-link"
                    :aria-label="$t('auth.flow.home_link', { site: $t('app.name') })"
                >
                    <img src="/favicon.svg" alt="" width="24" height="24" />
                    <span>{{ $t('app.name') }}</span>
                </NuxtLink>
                <aside
                    v-if="verificationEmailFailed"
                    class="auth-layout__verification ui-note ui-note--warning"
                    role="status"
                >
                    <p>{{ $t('identity.verification_delivery_failed') }}</p>
                    <NuxtLink :to="verificationPath">
                        {{ $t('identity.verification_resend') }}
                    </NuxtLink>
                </aside>
                <slot />
            </div>
        </main>
        <AppFooter
            :promotion-source="authorizationPage ? 'oauth' : undefined"
            class="auth-layout__footer"
        />
    </div>
</template>
<script setup lang="ts">
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

const route = useRoute();
const authorizationPage = computed(() => route.path.replace(/\/$/, '') === '/oauth/authorize');
const { verificationEmailFailed, load } = useAuth();
try {
    await load();
} catch {
    /* Network failure is not anonymous identity. */
}
const verificationPath = computed(() => ({
    path: '/profile',
    query: {
        tab: 'basic',
        redirect: getSafeRedirectTarget(route.query.redirect, getSafeRedirectTarget(route.fullPath))
    }
}));
</script>

<style scoped lang="scss">
.auth-layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: 100%;
    min-width: 0;
    min-height: 100dvh;
    background: var(--bg-secondary);

    &--consent {
        height: 100dvh;
        min-height: 0;
    }

    &__skip {
        position: fixed;
        top: 12px;
        left: -9999px;
        z-index: 3000;
        padding: var(--space-3);
        background: var(--bg-primary);
        color: var(--accent);
    }

    &__skip:focus {
        left: var(--space-4);
    }

    &__preferences {
        justify-self: end;
        padding: var(--space-2) var(--space-4) 0;
    }

    &__home {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        width: fit-content;
        min-width: 0;
        margin: 0 auto var(--space-3);
        color: var(--text-primary);
        font-size: var(--font-size-subheading);
        font-weight: 600;
        overflow-wrap: anywhere;

        img {
            flex-shrink: 0;
        }
    }

    &__main {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        min-height: 0;
        padding: var(--space-4) var(--space-4) var(--space-6);
    }

    &--consent &__main {
        margin: var(--space-1);
        padding: var(--space-1) var(--space-3) var(--space-3);
        overflow-y: auto;
    }

    &__content {
        flex: 0 0 auto;
        width: 100%;
        min-width: 0;
        max-width: 400px;
        margin-block: auto;
    }

    &__footer {
        --footer-content-width: 1100px;
        width: 100%;
        min-width: 0;
        margin: 0;
        padding: var(--space-2) var(--space-4) var(--space-1);
    }

    &__verification {
        margin-bottom: var(--space-4);
        overflow-wrap: anywhere;
    }
}

@media (max-width: 767px) {
    .auth-layout__main {
        padding: var(--space-3) var(--space-3) var(--space-5);
    }
}
</style>

<style lang="scss">
.auth-card {
    width: 100%;
    max-width: 400px;
    min-width: 0;

    > :last-child {
        margin-bottom: 0;
    }

    &__title {
        margin-bottom: var(--space-2);
        color: var(--text-primary);
        font-size: var(--font-size-title-mobile);
        font-weight: 600;
        line-height: 1.4;
        overflow-wrap: anywhere;
    }

    &__lead {
        margin-bottom: var(--space-4);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        line-height: 1.65;
        overflow-wrap: anywhere;
    }

    &__desc,
    &__status {
        margin-bottom: var(--space-4);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        line-height: 1.65;
        overflow-wrap: anywhere;
    }

    &__alert {
        margin-bottom: var(--space-4);
    }

    &__error {
        margin-bottom: var(--space-4);
        padding: var(--space-2) var(--space-3);
        border-left: 3px solid var(--el-color-danger);
        color: var(--text-primary);
        font-size: var(--font-size-control);
        line-height: 1.65;
        overflow-wrap: anywhere;
    }

    &__form {
        margin-bottom: var(--space-4);

        > :last-child {
            margin-bottom: 0;
        }
    }

    &__field--with-help {
        margin-bottom: var(--space-1);
    }

    &__field-hint {
        margin: 0 0 var(--space-4);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        line-height: 1.5;
        overflow-wrap: anywhere;
    }

    &__divider {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin: var(--space-4) 0 var(--space-3);
        color: var(--text-secondary);
        font-size: var(--font-size-meta);

        &::before,
        &::after {
            content: '';
            flex: 1;
            border-top: 1px solid var(--border-color);
        }
    }

    &__link,
    &__footer a {
        display: inline;
        overflow-wrap: anywhere;
    }

    &__footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0 var(--space-2);
        margin-top: var(--space-5);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        line-height: 1.65;
        overflow-wrap: anywhere;
    }

    &__captcha {
        min-width: 0;
        margin-bottom: var(--space-4);
    }

    &__captcha-widget {
        display: flex;
        justify-content: center;
    }

    &__captcha &__status {
        margin: var(--space-2) 0;
    }

    &__password-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
}
</style>
