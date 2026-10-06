<template>
    <div class="app-sidebar">
        <NuxtLink to="/" class="app-sidebar__brand ui-navigation-link" @click="$emit('navigate')">
            <img src="/favicon.svg" alt="" width="26" height="26" />
            <span>{{ $t('app.name') }}</span>
        </NuxtLink>
        <nav class="app-sidebar__nav" :aria-label="$t('app.name')">
            <NuxtLink
                v-for="item in navigation"
                :key="item.path"
                :to="item.path"
                class="app-sidebar__link ui-menu-link"
                :class="{ 'is-active': active(item.path) }"
                :aria-current="active(item.path) ? 'page' : undefined"
                @click="$emit('navigate')"
            >
                <component :is="item.icon" :size="19" :stroke-width="1.6" aria-hidden="true" />
                <span>{{ $t(item.label) }}</span>
            </NuxtLink>
        </nav>
        <div class="app-sidebar__account">
            <template v-if="user">
                <NuxtLink
                    to="/profile"
                    class="app-sidebar__link app-sidebar__identity ui-menu-link"
                    @click="$emit('navigate')"
                >
                    <AppUserAvatar
                        :size="38"
                        :src="user.avatarUrl"
                        :name="user.displayName || user.username"
                    />
                    <span class="app-sidebar__identity-text"
                        ><strong>{{ user.displayName || user.username }}</strong
                        ><span>@{{ user.username }}</span></span
                    >
                </NuxtLink>
                <button
                    type="button"
                    class="app-sidebar__link app-sidebar__logout ui-menu-link"
                    :disabled="logoutPending"
                    :aria-busy="logoutPending"
                    @click="$emit('logout')"
                >
                    <LogOut :size="19" aria-hidden="true" /><span>{{ $t('nav.logout') }}</span>
                </button>
            </template>
            <NuxtLink
                v-else-if="anonymous"
                to="/login"
                class="app-sidebar__link ui-menu-link"
                @click="$emit('navigate')"
                ><LogIn :size="19" aria-hidden="true" />{{ $t('nav.login') }}</NuxtLink
            >
        </div>
    </div>
</template>

<script setup lang="ts">
import { Home, LogOut, LogIn, Code, BookOpen, UserCircle, Shield, Globe } from 'lucide-vue-next';
import type { MeResponse } from '~/types/api';
const props = defineProps<{
    user: MeResponse | null;
    anonymous: boolean;
    logoutPending: boolean;
}>();
defineEmits<{ logout: []; navigate: [] }>();
const route = useRoute();
const navigation = computed(() => {
    const items = [{ path: '/', label: 'nav.home', icon: Home }];
    if (props.user) items.push({ path: '/profile', label: 'nav.my_profile', icon: UserCircle });
    items.push(
        { path: '/developer', label: 'nav.developer', icon: Code },
        { path: '/showcase', label: 'nav.showcase', icon: Globe },
        { path: '/about', label: 'nav.about', icon: BookOpen }
    );
    if (props.user?.role === 'admin')
        items.push({ path: '/admin', label: 'nav.admin', icon: Shield });
    return items;
});
function active(path: string) {
    return path === '/admin' ? route.path.startsWith('/admin') : route.path === path;
}
</script>

<style scoped lang="scss">
.app-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: var(--space-3) var(--space-3) var(--space-4);
    background: var(--bg-primary);
}
.app-sidebar__brand {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: 0 var(--space-3) var(--space-4);
    min-height: 52px;
    font-size: var(--font-size-section);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text-primary);
}
.app-sidebar__nav {
    display: grid;
    gap: var(--space-1);
}

.app-sidebar__account {
    margin-top: auto;
    padding-top: var(--space-5);
    border-top: 1px solid var(--divider-subtle);
}
.app-sidebar__identity {
    padding: var(--space-3);
    min-height: 44px;
}
.app-sidebar__identity-text {
    min-width: 0;
    display: grid;
}
.app-sidebar__identity-text strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-body);
    font-weight: 600;
}
.app-sidebar__identity-text > span {
    color: var(--text-muted);
    font-size: var(--font-size-meta);
    overflow-wrap: anywhere;
}
.app-sidebar__logout {
    width: 100%;
}
.app-sidebar__logout:disabled {
    cursor: wait;
}
</style>
