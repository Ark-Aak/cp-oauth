<template>
    <el-aside width="240px" class="app-sidebar">
        <div class="app-sidebar__logo">
            <span>{{ $t('app.name') }}</span>
        </div>
        <el-menu :default-active="activeRoute" router class="app-sidebar__menu">
            <el-menu-item index="/">
                <Home :size="18" />
                <span>{{ $t('nav.home') }}</span>
            </el-menu-item>
            <el-menu-item index="/developer">
                <Code :size="18" />
                <span>{{ $t('nav.developer') }}</span>
            </el-menu-item>
            <el-menu-item index="/about">
                <BookOpen :size="18" />
                <span>{{ $t('nav.about') }}</span>
            </el-menu-item>
            <el-menu-item v-if="isAdmin" index="/admin">
                <Shield :size="18" />
                <span>{{ $t('nav.admin') }}</span>
            </el-menu-item>
        </el-menu>
        <div class="app-sidebar__footer">
            <el-menu :default-active="activeRoute" router class="app-sidebar__menu">
                <el-menu-item v-if="isLoggedIn" index="/profile">
                    <UserCircle :size="18" />
                    <span>{{ $t('nav.my_profile') }}</span>
                </el-menu-item>
            </el-menu>
            <div v-if="isLoggedIn" class="app-sidebar__logout" @click="$emit('logout')">
                <LogOut :size="18" />
                <span>{{ $t('nav.logout') }}</span>
            </div>
            <el-menu v-if="!isLoggedIn" router class="app-sidebar__menu">
                <el-menu-item index="/login">
                    <LogIn :size="18" />
                    <span>{{ $t('nav.login') }}</span>
                </el-menu-item>
            </el-menu>
        </div>
    </el-aside>
</template>

<script setup lang="ts">
import { Home, LogOut, LogIn, Code, BookOpen, UserCircle, Shield } from 'lucide-vue-next';

defineProps<{ isLoggedIn: boolean; isAdmin: boolean }>();
defineEmits<{ logout: [] }>();

const route = useRoute();
const activeRoute = computed(() => route.path);
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
    z-index: 10;

    &__logo {
        padding: 20px 20px 24px;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: -0.02em;
    }

    &__menu {
        border-right: none;
        background: transparent;
        flex: 1;

        :deep(.el-menu-item) {
            height: 42px;
            line-height: 42px;
            margin: 0 8px 2px;
            border-radius: 6px;
            font-size: 14px;
            color: var(--text-secondary);
            gap: 10px;

            &:hover {
                background: var(--bg-tertiary);
                color: var(--text-primary);
            }

            &.is-active {
                background: var(--bg-tertiary);
                color: var(--accent);
            }
        }
    }

    &__footer {
        border-top: 1px solid var(--border-color);
        padding-top: 8px;
        margin-top: auto;
        padding-bottom: 12px;

        .app-sidebar__menu {
            flex: unset;
        }
    }

    &__logout {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 42px;
        padding: 0 20px;
        margin: 0 8px 2px;
        border-radius: 6px;
        font-size: 14px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }
    }
}
</style>
