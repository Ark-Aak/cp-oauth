<template>
    <NuxtLayout :name="sharedNavigation ? 'default' : false" :show-sidebar="false">
        <el-container
            class="auth-layout"
            :class="{
                'auth-layout--workspace': sharedNavigation,
                'auth-layout--consent': authorizationPage
            }"
        >
            <component :is="sharedNavigation ? 'div' : 'main'" class="auth-layout__main">
                <header v-if="!sharedNavigation" class="auth-layout__topbar">
                    <NuxtLink to="/" class="auth-layout__home ui-navigation-link"
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
                        v-if="verificationEmailFailed && !sharedNavigation"
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
                <AppFooter v-if="!sharedNavigation" />
            </component>
        </el-container>
    </NuxtLayout>
</template>
<script setup lang="ts">
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { SlidersHorizontal } from 'lucide-vue-next';

const route = useRoute();
const authorizationPage = computed(() => route.path.replace(/\/$/, '') === '/oauth/authorize');
const sharedNavigation = computed(() =>
    ['/login', '/oauth/authorize'].includes(route.path.replace(/\/$/, ''))
);
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
.auth-layout__topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 1100px;
    margin: 0 auto 24px;
    gap: 16px;
}
.auth-layout__home {
    display: inline-flex;
    gap: 10px;
    align-items: center;
    min-height: 44px;
    font-size: 20px;
    font-weight: 700;
}
.auth-layout__preferences {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--border-color);
    border-radius: var(--card-radius);
    background: var(--bg-primary);
    color: var(--text-primary);
    cursor: pointer;
}
@media (max-width: 767px) {
    :deep(.auth-card__title) {
        font-size: 24px;
    }
}
</style>

<style scoped lang="scss">
.auth-layout {
    &__main {
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        min-width: 0;
        min-height: 100dvh;
        padding: 32px 16px 16px;
        background: var(--bg-secondary);
    }

    &__content {
        width: 100%;
        max-width: 440px;
        margin: 0 auto;
        flex: 1;
        min-width: 0;
    }

    &--consent &__content {
        max-width: 560px;
    }

    &--workspace &__main {
        width: 100%;
        min-width: 0;
        min-height: 0;
        padding: 0;
        background: transparent;
    }

    &__verification {
        margin-bottom: 16px;
        padding: 16px;
        border: 1px solid var(--border-color);
        border-radius: var(--card-radius);
        background: var(--bg-primary);
        color: var(--text-primary);

        a {
            display: inline-flex;
            align-items: center;
            min-height: 44px;
        }
    }

    :deep(.auth-card) {
        width: 100%;
        max-width: 440px;
        border: 1px solid var(--border-color);
    }

    :deep(.auth-card__brand) {
        margin-bottom: 12px;
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 600;
    }

    :deep(.auth-card__title) {
        margin-bottom: 16px;
        color: var(--text-primary);
        font-size: 28px;
        font-weight: 600;
        line-height: 1.3;
        overflow-wrap: anywhere;
    }

    :deep(.auth-card__desc),
    :deep(.auth-card__status) {
        margin-bottom: 16px;
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.6;
        overflow-wrap: anywhere;
    }

    :deep(.auth-card__alert) {
        margin-bottom: 16px;
    }

    :deep(.auth-card__error) {
        margin-bottom: 16px;
        padding: 12px;
        border-left: 3px solid var(--el-color-danger);
        background: var(--bg-secondary);
        color: var(--text-primary);
        line-height: 1.6;
        overflow-wrap: anywhere;
    }

    :deep(.auth-card__button) {
        width: 100%;
    }

    :deep(.auth-card__actions) {
        display: grid;
        gap: 8px;
        margin-bottom: 16px;
    }

    :deep(.auth-card__actions .el-button + .el-button) {
        margin-left: 0;
    }

    :deep(.auth-card__link),
    :deep(.auth-card__footer a) {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
    }

    :deep(.auth-card__footer) {
        margin-top: 8px;
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.6;
    }

    :deep(.auth-card .el-button) {
        min-height: 44px;
        height: auto;
        white-space: normal;
    }

    :deep(.auth-card .el-button > span) {
        white-space: normal;
        line-height: 1.5;
    }

    :deep(.auth-card .el-input__wrapper) {
        min-height: 44px;
    }

    :deep(.auth-card__captcha) {
        min-width: 0;
        margin-bottom: 16px;
    }

    :deep(.auth-card__captcha-widget) {
        display: flex;
        justify-content: center;
    }

    :deep(.auth-card__captcha .auth-card__status) {
        margin: 8px 0;
    }

    :deep(.app-footer) {
        margin-top: 32px;
    }

    :deep(.app-footer a) {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
    }

    :deep(.auth-card .auth-card__password-toggle) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        padding: 0;
    }
}

@media (max-width: 480px) {
    .auth-layout {
        &__main {
            padding-top: 16px;
        }

        :deep(.auth-card .el-card__body) {
            padding: 16px;
        }
    }
}
@media (max-width: 767px) {
    .auth-layout :deep(.auth-card__title) {
        font-size: 24px;
    }
}
</style>
