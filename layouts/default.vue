<template>
    <div class="app-layout">
        <a class="app-layout__skip ui-navigation-link" href="#main-content">{{
            $t('nav.skip_content')
        }}</a>
        <aside class="app-layout__sidebar">
            <AppSidebar
                :user="user"
                :anonymous="status === 'anonymous'"
                :logout-pending="logoutPending"
                @logout="handleLogout"
            />
        </aside>
        <el-drawer
            id="mobile-navigation"
            v-model="sidebarOpen"
            direction="ltr"
            :title="$t('nav.navigation')"
            size="min(300px, calc(100vw - 32px))"
            class="app-layout__drawer"
            @closed="menuButton?.focus()"
        >
            <AppSidebar
                :user="user"
                :anonymous="status === 'anonymous'"
                :logout-pending="logoutPending"
                @logout="handleLogout"
                @navigate="sidebarOpen = false"
            />
        </el-drawer>
        <div class="app-layout__workspace">
            <header class="app-layout__topbar">
                <button
                    ref="menuButton"
                    type="button"
                    class="app-layout__menu"
                    :aria-label="$t('nav.toggle_menu')"
                    :aria-expanded="sidebarOpen"
                    aria-controls="mobile-navigation"
                    @click="sidebarOpen = true"
                >
                    <Menu :size="20" aria-hidden="true" />
                </button>
                <NuxtLink to="/" class="app-layout__brand ui-navigation-link">
                    <img src="/favicon.svg" alt="" width="22" height="22" />
                    <span>{{ $t('app.name') }}</span>
                </NuxtLink>
                <span class="app-layout__context">{{ $t(contextLabel) }}</span>
                <el-popover
                    trigger="click"
                    placement="bottom-end"
                    :width="288"
                    role="dialog"
                    :aria-label="$t('settings.title')"
                    focus-on-show
                >
                    <AppPreferences />
                    <template #reference
                        ><button
                            type="button"
                            class="app-layout__icon-button"
                            :aria-label="$t('settings.title')"
                        >
                            <SlidersHorizontal :size="18" aria-hidden="true" /></button
                    ></template>
                </el-popover>
            </header>
            <main id="main-content" tabindex="-1" class="app-layout__main">
                <div
                    v-if="authError"
                    role="alert"
                    class="app-layout__notice ui-note ui-note--danger"
                >
                    <p>{{ $t('identity.identity_unavailable') }}</p>
                    <el-button :loading="identityPending" @click="retryIdentity">{{
                        $t('identity.retry')
                    }}</el-button>
                </div>
                <p
                    v-if="logoutError"
                    role="alert"
                    class="app-layout__notice ui-note ui-note--danger"
                >
                    {{ logoutError }}
                </p>
                <div
                    v-if="verificationEmailFailed"
                    role="status"
                    class="app-layout__notice ui-note ui-note--warning"
                >
                    <p>{{ $t('identity.verification_delivery_failed') }}</p>
                    <NuxtLink to="/profile?tab=basic">{{
                        $t('identity.verification_resend')
                    }}</NuxtLink>
                </div>
                <el-alert
                    v-if="identityConfirmed"
                    class="app-layout__notice"
                    :title="$t('identity.identity_confirmed')"
                    :closable="false"
                    type="success"
                    show-icon
                    ><el-button text @click="identityConfirmed = false">{{
                        $t('identity.dismiss_notice')
                    }}</el-button></el-alert
                >
                <slot />
            </main>
            <div class="app-layout__footer"><AppFooter /></div>
        </div>
        <AuthReauthenticationDialog />
    </div>
</template>

<script setup lang="ts">
import { Menu, SlidersHorizontal } from 'lucide-vue-next';
import { getCurrentInstance } from 'vue';
import { ElMessageBox } from 'element-plus';
const { t } = useI18n();
const messageBoxContext = getCurrentInstance()?.appContext;
const { user, status, error: authError, load, logout, verificationEmailFailed } = useAuth();
const { confirmed: identityConfirmed } = useReauthentication();
const sidebarOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);
const identityPending = ref(false);
const logoutPending = ref(false);
const logoutError = ref('');
async function retryIdentity() {
    identityPending.value = true;
    try {
        await load(true);
    } catch {
        /* Shared error stays visible. */
    } finally {
        identityPending.value = false;
    }
}
try {
    await load();
} catch {
    /* Network failure is not anonymous identity. */
}
const route = useRoute();
const contextLabels: Record<string, string> = {
    '/': 'nav.home',
    '/profile': 'nav.my_profile',
    '/developer': 'nav.developer',
    '/showcase': 'nav.showcase',
    '/about': 'nav.about'
};
const contextLabel = computed(() =>
    route.path.startsWith('/admin') ? 'nav.admin' : contextLabels[route.path] || 'app.name'
);
watch(
    () => route.fullPath,
    () => {
        sidebarOpen.value = false;
    }
);
async function handleLogout() {
    if (logoutPending.value) return;
    try {
        await ElMessageBox.confirm(
            t('nav.logout_confirm'),
            t('nav.logout'),
            {
                type: 'warning',
                confirmButtonText: t('nav.logout'),
                cancelButtonText: t('common.cancel')
            },
            messageBoxContext
        );
    } catch (cause) {
        if (cause !== 'cancel' && cause !== 'close') {
            logoutError.value = t('common.error');
        }
        return;
    }
    logoutPending.value = true;
    logoutError.value = '';
    try {
        await logout();
        sidebarOpen.value = false;
    } catch (error: unknown) {
        logoutError.value =
            (error as { data?: { message?: string } }).data?.message || t('identity.network_error');
    } finally {
        logoutPending.value = false;
    }
}
</script>

<style scoped lang="scss">
.app-layout {
    min-height: 100dvh;
}
.app-layout__sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 20;
    width: var(--sidebar-width);
    overflow-y: auto;
    border-right: 1px solid var(--border-color);
    background: var(--bg-primary);
}
.app-layout__workspace {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 100dvh;
    margin-left: var(--sidebar-width);
}
.app-layout__topbar {
    position: sticky;
    top: 0;
    z-index: 15;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: var(--topbar-height);
    padding: 0 var(--space-6);
    border-bottom: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
    backdrop-filter: blur(8px);
}
.app-layout__brand {
    display: none;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-primary);
    font-size: var(--font-size-subheading);
    font-weight: 700;
    white-space: nowrap;
}
.app-layout__context {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
    font-size: var(--font-size-control);
    font-weight: 600;
}
.app-layout__menu,
.app-layout__icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--control-height);
    height: var(--control-height);
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--card-radius);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
}
.app-layout__menu:hover,
.app-layout__icon-button:hover {
    border-color: var(--border-color);
    background: var(--bg-secondary);
    color: var(--accent);
}
.app-layout__icon-button {
    margin-left: auto;
}
.app-layout__menu {
    display: none;
    color: var(--text-primary);
}
.app-layout__main {
    flex: 1;
    width: 100%;
    max-width: 1240px;
    min-width: 0;
    margin: 0 auto;
    padding: var(--space-6) var(--space-6) var(--space-6);
}
.app-layout__footer {
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: 0 var(--space-6) var(--space-4);
}
.app-layout__notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
}
.app-layout__skip {
    position: fixed;
    left: -9999px;
    top: 12px;
    z-index: 3000;
    padding: 12px;
    background: var(--bg-primary);
    color: var(--accent);
}
.app-layout__skip:focus {
    left: calc(var(--sidebar-width) + 16px);
}
:deep(.app-layout__drawer .el-drawer__body) {
    padding: 0;
    display: flex;
    flex-direction: column;
}
@media (max-width: 1023px) {
    .app-layout__sidebar {
        display: none;
    }
    .app-layout__workspace {
        margin-left: 0;
    }
    .app-layout__topbar {
        gap: var(--space-2);
        padding: 0 var(--space-4);
    }
    .app-layout__menu,
    .app-layout__brand {
        display: inline-flex;
    }
    .app-layout__context {
        display: none;
    }
    .app-layout__main {
        padding: var(--space-4);
    }
    .app-layout__footer {
        padding: 0 var(--space-4) var(--space-4);
    }
    .app-layout__skip:focus {
        left: 16px;
    }
}
</style>
