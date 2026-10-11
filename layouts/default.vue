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
            <div class="app-layout__corner">
                <button
                    ref="menuButton"
                    type="button"
                    class="app-layout__menu"
                    :aria-label="$t('nav.toggle_menu')"
                    :aria-expanded="sidebarOpen"
                    aria-controls="mobile-navigation"
                    @click="sidebarOpen = true"
                >
                    <Menu :size="18" :stroke-width="1.5" aria-hidden="true" />
                </button>
                <AppPreferences mode="icons" class="app-layout__preferences" />
            </div>
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
            <AppFooter class="app-layout__footer" />
        </div>
        <AuthReauthenticationDialog />
    </div>
</template>

<script setup lang="ts">
import { Menu } from 'lucide-vue-next';
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
.app-layout__corner {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-4) 0;
}
.app-layout__menu {
    display: none;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--control-height);
    height: var(--control-height);
    margin-right: auto;
    padding: 0;
    border: 0;
    border-radius: var(--card-radius);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
}
.app-layout__menu:hover {
    color: var(--accent);
}
.app-layout__main {
    flex: 1;
    width: 100%;
    max-width: 1240px;
    min-width: 0;
    margin: 0 auto;
    padding: var(--space-2) var(--space-6) var(--space-6);
}
.app-layout__footer {
    --footer-content-width: 1100px;
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: var(--space-2) var(--space-4) var(--space-1);
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
    .app-layout__corner {
        padding: var(--space-2) var(--space-3) 0;
    }
    .app-layout__menu {
        display: inline-flex;
    }
    .app-layout__main {
        padding: var(--space-2) var(--space-4) var(--space-4);
    }
    .app-layout__skip:focus {
        left: 16px;
    }
}
</style>
