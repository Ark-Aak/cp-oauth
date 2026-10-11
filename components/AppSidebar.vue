<template>
    <div class="app-sidebar">
        <NuxtLink to="/" class="app-sidebar__brand ui-navigation-link" @click="$emit('navigate')">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            <span>{{ $t('app.name') }}</span>
        </NuxtLink>
        <nav class="app-sidebar__nav" :aria-label="$t('nav.navigation')">
            <NuxtLink
                v-for="item in navigation"
                :key="item.path"
                :to="item.path"
                class="app-sidebar__link ui-menu-link"
                :class="{ 'is-active': active(item.path) }"
                :aria-current="active(item.path) ? 'page' : undefined"
                @click="$emit('navigate')"
            >
                <component :is="item.icon" :size="18" :stroke-width="1.75" aria-hidden="true" />
                <span>{{ $t(item.label) }}</span>
            </NuxtLink>
        </nav>
        <div class="app-sidebar__account">
            <template v-if="user">
                <NuxtLink
                    to="/profile"
                    class="app-sidebar__identity ui-navigation-link"
                    @click="$emit('navigate')"
                >
                    <AppUserAvatar
                        :size="36"
                        :src="user.avatarUrl"
                        :name="user.displayName || user.username"
                        :seed="user.id"
                    />
                    <span class="app-sidebar__identity-text"
                        ><strong>{{ user.displayName || user.username }}</strong
                        ><span>@{{ user.username }}</span></span
                    >
                </NuxtLink>
                <button
                    type="button"
                    class="app-sidebar__logout ui-menu-link"
                    :disabled="logoutPending"
                    :aria-busy="logoutPending"
                    @click="$emit('logout')"
                >
                    <LogOut :size="18" aria-hidden="true" /><span>{{ $t('nav.logout') }}</span>
                </button>
            </template>
            <NuxtLink
                v-else-if="anonymous"
                to="/login"
                class="el-button el-button--primary app-sidebar__login"
                @click="$emit('navigate')"
                ><LogIn :size="16" aria-hidden="true" /><span>{{ $t('nav.login') }}</span></NuxtLink
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
    padding: var(--space-4) var(--space-3);
    background: var(--bg-primary);
}
.app-sidebar__brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3) var(--space-5);
    color: var(--text-primary);
    font-size: var(--font-size-section);
    font-weight: 700;
    letter-spacing: -0.01em;
}
.app-sidebar__brand img {
    flex-shrink: 0;
}
.app-sidebar__nav {
    display: grid;
    gap: var(--space-1);
}
.app-sidebar__link {
    font-size: var(--font-size-body);
}
.app-sidebar__account {
    display: grid;
    gap: var(--space-1);
    margin-top: auto;
    padding: var(--space-2);
    background: var(--bg-secondary);
    border: 1px solid var(--divider-subtle);
    border-radius: var(--card-radius);
}
.app-sidebar__identity {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-1);
    border-radius: var(--card-radius);
    color: var(--text-primary);
}
.app-sidebar__identity:hover {
    background: var(--bg-primary);
}
.app-sidebar__identity-text {
    display: grid;
    min-width: 0;
    line-height: 1.35;
}
.app-sidebar__identity-text strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-control);
    font-weight: 600;
}
.app-sidebar__identity-text > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
    font-size: var(--font-size-meta);
}
.app-sidebar__logout {
    width: 100%;
}
.app-sidebar__logout:hover {
    background: var(--bg-primary);
}
.app-sidebar__logout:disabled {
    cursor: wait;
}
.app-sidebar__login {
    justify-self: start;
}
</style>
