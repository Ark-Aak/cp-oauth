<template>
    <div class="app-layout">
        <a class="app-layout__skip" href="#main-content">{{ $t('nav.skip_content') }}</a>
        <aside class="app-layout__desktop-nav">
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
            size="min(320px, calc(100vw - 32px))"
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
                    <Menu :size="21" aria-hidden="true" />
                </button>
                <span class="app-layout__context">{{ $t(contextLabel) }}</span>
                <div class="app-layout__desktop-preferences"><AppPreferences inline /></div>
                <el-popover trigger="click" placement="bottom-end" :width="288">
                    <AppPreferences />
                    <template #reference
                        ><button
                            type="button"
                            class="app-layout__mobile-preferences"
                            :aria-label="$t('settings.title')"
                        >
                            <SlidersHorizontal :size="21" aria-hidden="true" /></button
                    ></template>
                </el-popover>
            </header>
            <main id="main-content" tabindex="-1" class="app-layout__main">
                <div v-if="authError" role="alert" class="app-layout__notice">
                    <p>{{ $t('identity.identity_unavailable') }}</p>
                    <el-button :loading="identityPending" @click="retryIdentity">{{
                        $t('identity.retry')
                    }}</el-button>
                </div>
                <p v-if="logoutError" role="alert" class="app-layout__notice">{{ logoutError }}</p>
                <div v-if="verificationEmailFailed" role="status" class="app-layout__notice">
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
const { t } = useI18n();
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
.app-layout__desktop-nav {
    position: fixed;
    inset: 0 auto 0 0;
    width: var(--sidebar-width);
    border-right: 1px solid var(--border-color);
    z-index: 20;
    overflow-y: auto;
}
.app-layout__workspace {
    margin-left: var(--sidebar-width);
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
}
.app-layout__topbar {
    min-height: 64px;
    padding: var(--space-2) var(--space-5);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-primary);
}
.app-layout__context {
    font-size: var(--font-size-control);
    font-weight: 600;
    color: var(--text-secondary);
    letter-spacing: 0.06em;
}
.app-layout__desktop-preferences {
    margin-left: auto;
}
.app-layout__menu,
.app-layout__mobile-preferences {
    display: none;
}
.app-layout__main {
    width: 100%;
    max-width: 1248px;
    padding: var(--space-5);
    margin: 0 auto;
    flex: 1;
    min-width: 0;
}
.app-layout__footer {
    width: 100%;
    max-width: 1248px;
    padding: 0 var(--space-5) var(--space-4);
    margin: 0 auto;
}
.app-layout__notice {
    padding: var(--space-4);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    border-radius: var(--card-radius);
    margin-bottom: var(--space-5);
}
.app-layout__notice a {
    color: var(--accent);
    text-decoration: underline;
    display: inline-flex;
    min-height: 44px;
    align-items: center;
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
    .app-layout__desktop-nav {
        display: none;
    }
    .app-layout__workspace {
        margin-left: 0;
    }
    .app-layout__topbar {
        min-height: 56px;
        padding: 6px var(--space-4);
        position: sticky;
        top: 0;
        z-index: 15;
    }
    .app-layout__context {
        font-size: var(--font-size-body);
        letter-spacing: 0;
    }
    .app-layout__desktop-preferences {
        display: none;
    }
    .app-layout__menu,
    .app-layout__mobile-preferences {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: var(--card-radius);
        background: transparent;
        color: var(--text-primary);
        cursor: pointer;
    }
    .app-layout__mobile-preferences {
        margin-left: auto;
    }
    .app-layout__main {
        padding: var(--space-5) var(--space-4);
    }
    .app-layout__footer {
        padding: 0 var(--space-4) var(--space-4);
    }
    .app-layout__skip:focus {
        left: 16px;
    }
}
</style>
