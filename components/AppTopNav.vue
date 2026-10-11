<template>
    <nav v-if="orientation === 'horizontal'" :aria-label="$t('nav.navigation')" class="app-top-nav">
        <NuxtLink
            v-for="item in navigation"
            :key="item.path"
            :to="item.path"
            class="app-top-nav__link"
            :class="{ 'is-active': active(item.path) }"
            :aria-current="active(item.path) ? 'page' : undefined"
            @click="$emit('navigate')"
        >
            {{ $t(item.label) }}
        </NuxtLink>
    </nav>
    <div v-else class="app-top-nav-panel">
        <nav :aria-label="$t('nav.navigation')" class="app-top-nav-panel__nav">
            <NuxtLink
                v-for="item in navigation"
                :key="item.path"
                :to="item.path"
                class="ui-menu-link"
                :class="{ 'is-active': active(item.path) }"
                :aria-current="active(item.path) ? 'page' : undefined"
                @click="$emit('navigate')"
            >
                <component :is="item.icon" :size="18" :stroke-width="1.6" aria-hidden="true" />
                <span>{{ $t(item.label) }}</span>
            </NuxtLink>
        </nav>
        <div class="app-top-nav-panel__account">
            <template v-if="user">
                <NuxtLink
                    to="/profile"
                    class="app-top-nav-panel__identity ui-menu-link"
                    @click="$emit('navigate')"
                >
                    <AppUserAvatar
                        :size="28"
                        :src="user.avatarUrl"
                        :name="user.displayName || user.username"
                        :seed="user.id"
                    />
                    <span class="app-top-nav-panel__identity-text"
                        ><strong>{{ user.displayName || user.username }}</strong
                        ><span>@{{ user.username }}</span></span
                    >
                </NuxtLink>
                <button
                    type="button"
                    class="app-top-nav-panel__logout ui-menu-link"
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
                class="ui-menu-link"
                @click="$emit('navigate')"
                ><LogIn :size="18" aria-hidden="true" />{{ $t('nav.login') }}</NuxtLink
            >
        </div>
    </div>
</template>

<script setup lang="ts">
import { Home, LogOut, LogIn, Code, BookOpen, UserCircle, Shield, Globe } from 'lucide-vue-next';
import type { MeResponse } from '~/types/api';
const props = withDefaults(
    defineProps<{
        user: MeResponse | null;
        anonymous: boolean;
        logoutPending: boolean;
        orientation?: 'horizontal' | 'vertical';
    }>(),
    { orientation: 'horizontal' }
);
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
.app-top-nav {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
}
.app-top-nav::-webkit-scrollbar {
    display: none;
}
.app-top-nav__link {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    height: 32px;
    padding: 0 var(--space-3);
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: var(--font-size-control);
    white-space: nowrap;
    transition: color 140ms ease;
}
.app-top-nav__link:hover {
    color: var(--accent);
}
.app-top-nav__link.is-active {
    color: var(--accent);
    font-weight: 600;
    border-bottom-color: var(--accent);
}
.app-top-nav-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: var(--space-3);
    background: var(--bg-primary);
}
.app-top-nav-panel__nav {
    display: grid;
    gap: var(--space-1);
}
.app-top-nav-panel__account {
    display: grid;
    gap: var(--space-1);
    margin-top: auto;
    padding-top: var(--space-2);
    border-top: 1px solid var(--divider-subtle);
}
.app-top-nav-panel__identity-text {
    min-width: 0;
    display: grid;
    line-height: 1.4;
}
.app-top-nav-panel__identity-text strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
    font-weight: 600;
}
.app-top-nav-panel__identity-text > span {
    color: var(--text-muted);
    font-size: var(--font-size-meta);
    overflow-wrap: anywhere;
}
.app-top-nav-panel__logout:disabled {
    cursor: wait;
}
</style>
