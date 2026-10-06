<template>
    <el-container class="auth-layout">
        <el-main class="auth-layout__main">
            <header class="auth-layout__topbar">
                <NuxtLink to="/" class="auth-layout__home"
                    ><img src="/favicon.svg" alt="" width="26" height="26" />{{
                        $t('app.name')
                    }}</NuxtLink
                >
                <el-popover trigger="click" placement="bottom-end" :width="288">
                    <AppPreferences />
                    <template #reference
                        ><button
                            type="button"
                            class="auth-layout__preferences"
                            :aria-label="$t('settings.title')"
                        >
                            <SlidersHorizontal :size="21" aria-hidden="true" /></button
                    ></template>
                </el-popover>
            </header>
            <div class="auth-layout__content">
                <aside
                    v-if="verificationEmailFailed"
                    class="auth-layout__verification"
                    role="status"
                >
                    <p>{{ $t('identity.verification_delivery_failed') }}</p>
                    <NuxtLink :to="verificationPath">
                        {{ $t('identity.verification_resend') }}
                    </NuxtLink>
                </aside>
                <slot />
            </div>
            <AppFooter class="auth-layout__footer" />
        </el-main>
    </el-container>
</template>
<script setup lang="ts">
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { SlidersHorizontal } from 'lucide-vue-next';

const route = useRoute();
const { verificationEmailFailed } = useAuth();
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
    &__main {
        display: flex;
        flex-direction: column;
        min-height: 100dvh;
        padding: var(--space-5) var(--space-4) var(--space-4);
        background: var(--bg-secondary);
    }

    &__topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        max-width: 1100px;
        margin: 0 auto var(--space-5);
        gap: var(--space-4);
    }

    &__home {
        display: inline-flex;
        gap: var(--space-2);
        align-items: center;
        min-width: 0;
        min-height: 44px;
        font-size: var(--font-size-subheading);
        font-weight: 600;
        overflow-wrap: anywhere;

        img {
            flex-shrink: 0;
        }
    }

    &__preferences {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border: 1px solid var(--border-color);
        border-radius: var(--card-radius);
        background: var(--bg-primary);
        color: var(--text-primary);
        cursor: pointer;
    }

    &__content {
        width: 100%;
        max-width: 420px;
        margin: 0 auto;
        flex: 1;
        min-width: 0;
    }

    &__verification {
        margin-bottom: var(--space-4);
        padding: var(--panel-padding);
        border: 1px solid var(--border-color);
        border-radius: var(--card-radius);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: var(--font-size-control);
        overflow-wrap: anywhere;

        a {
            display: inline-flex;
            align-items: center;
            min-height: 44px;
            text-decoration: underline;
        }
    }

    &__footer {
        width: 100%;
        max-width: 1100px;
        margin: var(--space-6) auto 0;
    }
}

@media (max-width: 767px) {
    .auth-layout__main {
        padding-top: var(--space-4);
    }

    .auth-layout__topbar {
        margin-bottom: var(--space-4);
    }
}
</style>

<style lang="scss">
.auth-card {
    width: 100%;
    max-width: 420px;
    min-width: 0;
    padding: var(--panel-padding);
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--card-radius);

    > :last-child {
        margin-bottom: 0;
    }

    &__title {
        margin-bottom: var(--space-4);
        color: var(--text-primary);
        font-size: var(--font-size-title);
        font-weight: 600;
        line-height: 1.3;
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
        padding: var(--space-3);
        border-left: 3px solid var(--el-color-danger);
        background: var(--bg-secondary);
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
        margin-bottom: 0;
    }

    &__button {
        width: 100%;
    }

    &__actions {
        display: grid;
        gap: var(--space-2);
        margin-bottom: var(--space-4);

        > .el-button {
            margin: 0;
        }
    }

    &__link,
    &__footer a {
        display: inline-flex;
        align-items: center;
        min-width: 44px;
        min-height: 44px;
        color: var(--text-primary);
        text-decoration: underline;
        overflow-wrap: anywhere;
    }

    &__recovery {
        display: flex;
        width: fit-content;
        margin: 0 0 var(--space-2) auto;
        font-size: var(--font-size-control);
    }

    &__footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0 var(--space-1);
        margin-top: var(--space-2);
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
        min-width: 44px;
        padding: 0;
    }
}

@media (max-width: 767px) {
    .auth-card__title {
        font-size: var(--font-size-title-mobile);
    }
}
</style>
