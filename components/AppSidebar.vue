<template>
    <el-aside width="240px" class="app-sidebar" :class="{ 'is-open': open }">
        <div class="app-sidebar__logo">
            <img src="/favicon.svg" alt="CP OAuth logo" class="app-sidebar__logo-image" />
            <span>{{ $t('app.name') }}</span>
        </div>
        <el-menu :default-active="activeRoute" router class="app-sidebar__menu" @select="handleNav">
            <el-menu-item index="/">
                <Home :size="17" :stroke-width="1.5" />
                <span>{{ $t('nav.home') }}</span>
            </el-menu-item>
            <el-menu-item index="/developer">
                <Code :size="17" :stroke-width="1.5" />
                <span>{{ $t('nav.developer') }}</span>
            </el-menu-item>
            <el-menu-item index="/about">
                <BookOpen :size="17" :stroke-width="1.5" />
                <span>{{ $t('nav.about') }}</span>
            </el-menu-item>
            <el-menu-item v-if="isAdmin" index="/admin">
                <Shield :size="17" :stroke-width="1.5" />
                <span>{{ $t('nav.admin') }}</span>
            </el-menu-item>
        </el-menu>
        <div class="app-sidebar__footer">
            <el-menu
                :default-active="activeRoute"
                router
                class="app-sidebar__menu"
                @select="handleNav"
            >
                <el-menu-item v-if="isLoggedIn" index="/profile">
                    <UserCircle :size="17" :stroke-width="1.5" />
                    <span>{{ $t('nav.my_profile') }}</span>
                </el-menu-item>
            </el-menu>
            <div v-if="isLoggedIn" class="app-sidebar__logout" @click="$emit('logout')">
                <LogOut :size="17" :stroke-width="1.5" />
                <span>{{ $t('nav.logout') }}</span>
            </div>
            <el-menu v-if="!isLoggedIn" router class="app-sidebar__menu" @select="handleNav">
                <el-menu-item index="/login">
                    <LogIn :size="17" :stroke-width="1.5" />
                    <span>{{ $t('nav.login') }}</span>
                </el-menu-item>
            </el-menu>
        </div>
    </el-aside>
</template>

<script setup lang="ts">
import { Home, LogOut, LogIn, Code, BookOpen, UserCircle, Shield } from 'lucide-vue-next';

defineProps<{ isLoggedIn: boolean; isAdmin: boolean; open: boolean }>();
const emit = defineEmits<{ logout: []; navigate: [] }>();

const route = useRoute();
const activeRoute = computed(() => route.path);

function handleNav() {
    emit('navigate');
}
</script>

<style scoped lang="scss">
.app-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    z-index: 20;

    &__logo {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 20px 20px 20px;
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: -0.01em;
    }

    &__logo-image {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
    }

    &__menu {
        border-right: none;
        background: transparent;
        flex: 1;

        :deep(.el-menu-item) {
            height: 38px;
            line-height: 38px;
            margin: 1px 8px;
            border-radius: 6px;
            font-size: 14px;
            color: var(--text-secondary);
            gap: 9px;
            transition:
                background 0.15s ease,
                color 0.15s ease;

            &:hover {
                background: var(--bg-tertiary);
                color: var(--text-primary);
            }

            &.is-active {
                background: var(--bg-tertiary);
                color: var(--text-primary);
                font-weight: 500;
                position: relative;

                &::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 8px;
                    bottom: 8px;
                    width: 2px;
                    border-radius: 1px;
                    background: var(--accent);
                }
            }
        }
    }

    &__footer {
        border-top: 1px solid var(--border-color);
        padding-top: 6px;
        margin-top: auto;
        padding-bottom: 10px;

        .app-sidebar__menu {
            flex: unset;
        }
    }

    &__logout {
        display: flex;
        align-items: center;
        gap: 9px;
        height: 38px;
        padding: 0 20px;
        margin: 1px 8px;
        border-radius: 6px;
        font-size: 14px;
        color: var(--text-secondary);
        cursor: pointer;
        transition:
            background 0.15s ease,
            color 0.15s ease;

        &:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }
    }
}

@media (max-width: 768px) {
    .app-sidebar {
        transform: translateX(-100%);
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);

        &.is-open {
            transform: translateX(0);
        }
    }
}
</style>
