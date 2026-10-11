<template>
    <div class="app-layout">
        <a class="app-layout__skip ui-navigation-link" href="#main-content">{{
            $t('nav.skip_content')
        }}</a>
        <header class="app-layout__topbar">
            <div class="app-layout__bar">
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
                    <img src="/favicon.svg" alt="" width="20" height="20" />
                    <span>{{ $t('app.name') }}</span>
                </NuxtLink>
                <AppTopNav
                    class="app-layout__nav"
                    orientation="horizontal"
                    :user="user"
                    :anonymous="status === 'anonymous'"
                    :logout-pending="logoutPending"
                />
                <div class="app-layout__bar-end">
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
                    <el-dropdown v-if="user" trigger="click" placement="bottom-end">
                        <button
                            type="button"
                            class="app-layout__account"
                            :aria-label="user.displayName || user.username"
                        >
                            <AppUserAvatar
                                :size="24"
                                :src="user.avatarUrl"
                                :name="user.displayName || user.username"
                                :seed="user.id"
                            />
                            <span class="app-layout__account-name">{{
                                user.displayName || user.username
                            }}</span>
                        </button>
                        <template #dropdown>
                            <el-dropdown-menu>
                                <el-dropdown-item @click="openMenuLink($event, '/profile')">
                                    <NuxtLink
                                        to="/profile"
                                        tabindex="-1"
                                        class="app-layout__menu-link ui-navigation-link"
                                        >{{ $t('nav.my_profile') }}</NuxtLink
                                    >
                                </el-dropdown-item>
                                <el-dropdown-item
                                    @click="openMenuLink($event, `/user/${user.username}`)"
                                >
                                    <NuxtLink
                                        :to="`/user/${user.username}`"
                                        tabindex="-1"
                                        class="app-layout__menu-link ui-navigation-link"
                                        >{{ $t('profile.view_public') }}</NuxtLink
                                    >
                                </el-dropdown-item>
                                <el-dropdown-item
                                    divided
                                    :disabled="logoutPending"
                                    @click="handleLogout"
                                >
                                    {{ $t('nav.logout') }}
                                </el-dropdown-item>
                            </el-dropdown-menu>
                        </template>
                    </el-dropdown>
                    <NuxtLink
                        v-else-if="status === 'anonymous'"
                        to="/login"
                        class="el-button el-button--primary"
                        >{{ $t('nav.login') }}</NuxtLink
                    >
                </div>
            </div>
        </header>
        <el-drawer
            id="mobile-navigation"
            v-model="sidebarOpen"
            direction="ltr"
            :title="$t('nav.navigation')"
            size="min(320px, calc(100vw - 32px))"
            class="app-layout__drawer"
            @closed="menuButton?.focus()"
        >
            <AppTopNav
                orientation="vertical"
                :user="user"
                :anonymous="status === 'anonymous'"
                :logout-pending="logoutPending"
                @logout="handleLogout"
                @navigate="sidebarOpen = false"
            />
        </el-drawer>
        <main id="main-content" tabindex="-1" class="app-layout__main">
            <div v-if="authError" role="alert" class="app-layout__notice ui-note ui-note--danger">
                <p>{{ $t('identity.identity_unavailable') }}</p>
                <el-button :loading="identityPending" @click="retryIdentity">{{
                    $t('identity.retry')
                }}</el-button>
            </div>
            <p v-if="logoutError" role="alert" class="app-layout__notice ui-note ui-note--danger">
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
watch(
    () => route.fullPath,
    () => {
        sidebarOpen.value = false;
    }
);
/* Pointer clicks land on the inner link; keyboard activation reaches only the menu item. */
function openMenuLink(event: Event, path: string) {
    if (event.type === 'keydown') void navigateTo(path);
}
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
    display: flex;
    flex-direction: column;
}
.app-layout__topbar {
    position: sticky;
    top: 0;
    z-index: 15;
    height: var(--topbar-height);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-primary);
}
.app-layout__bar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--space-5);
}
.app-layout__brand {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    gap: var(--space-2);
    color: var(--text-primary);
    font-size: var(--font-size-subheading);
    font-weight: 700;
    white-space: nowrap;
}
.app-layout__nav {
    flex: 1 1 auto;
    align-self: stretch;
}
.app-layout__bar-end {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: var(--space-1);
    margin-left: auto;
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
    border: 0;
    border-radius: var(--card-radius);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
}
.app-layout__menu:hover,
.app-layout__icon-button:hover {
    color: var(--accent);
}
.app-layout__menu {
    display: none;
    color: var(--text-primary);
}
.app-layout__account {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--control-height);
    max-width: 200px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--card-radius);
    background: transparent;
    color: var(--text-primary);
    font-size: var(--font-size-control);
    cursor: pointer;
}
.app-layout__account:hover {
    color: var(--accent);
}
.app-layout__account-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.app-layout__menu-link {
    display: flex;
    flex: 1;
    align-items: center;
    align-self: stretch;
    margin: -5px -16px;
    padding: 5px 16px;
}
.app-layout__main {
    flex: 1;
    width: 100%;
    max-width: 1200px;
    min-width: 0;
    margin: 0 auto;
    padding: var(--space-5) var(--space-5) var(--space-6);
}
.app-layout__footer {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--space-5) var(--space-4);
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
    left: 16px;
}
:deep(.app-layout__drawer .el-drawer__body) {
    padding: 0;
    display: flex;
    flex-direction: column;
}
@media (max-width: 1023px) {
    .app-layout__bar {
        gap: var(--space-2);
        padding: 0 var(--space-4);
    }
    .app-layout__menu {
        display: inline-flex;
    }
    .app-layout__nav {
        display: none;
    }
    .app-layout__account {
        width: var(--control-height);
        justify-content: center;
        padding: 0;
    }
    .app-layout__account-name {
        display: none;
    }
    .app-layout__main {
        padding: var(--space-4);
    }
    .app-layout__footer {
        padding: 0 var(--space-4) var(--space-4);
    }
}
</style>
