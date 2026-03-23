<template>
    <el-container class="app-layout">
        <!-- Mobile overlay -->
        <div v-if="sidebarOpen" class="app-layout__overlay" @click="sidebarOpen = false" />
        <AppSidebar
            :is-logged-in="isLoggedIn"
            :is-admin="isAdmin"
            :open="sidebarOpen"
            @logout="handleLogout"
            @navigate="sidebarOpen = false"
        />
        <el-main class="app-layout__main">
            <button class="app-layout__menu-btn" @click="sidebarOpen = !sidebarOpen">
                <Menu :size="20" :stroke-width="1.5" />
            </button>
            <div class="app-layout__content">
                <slot />
            </div>
            <AppFooter />
        </el-main>
    </el-container>
</template>

<script setup lang="ts">
import { Menu } from 'lucide-vue-next';

const token = useCookie('auth_token');
const isLoggedIn = computed(() => !!token.value);
const userRole = ref('');
const sidebarOpen = ref(false);

async function fetchRole() {
    if (!token.value) {
        userRole.value = '';
        return;
    }
    try {
        const data = await $fetch<{ role: string }>('/api/auth/me', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
        userRole.value = data.role;
    } catch {
        userRole.value = '';
    }
}

const isAdmin = computed(() => userRole.value === 'admin');

watch(token, () => fetchRole(), { immediate: true });

const route = useRoute();
watch(
    () => route.path,
    () => {
        sidebarOpen.value = false;
    }
);

function handleLogout() {
    token.value = null;
    userRole.value = '';
    sidebarOpen.value = false;
    navigateTo('/login');
}
</script>

<style scoped lang="scss">
.app-layout {
    min-height: 100vh;

    &__overlay {
        display: none;
    }

    &__menu-btn {
        display: none;
    }

    &__main {
        margin-left: 240px;
        padding: 28px 36px;
        background: var(--bg-primary);
        min-height: 100vh;
    }

    &__content {
        min-height: 100vh;
    }
}

@media (max-width: 768px) {
    .app-layout {
        &__overlay {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.3);
            z-index: 19;
        }

        &__menu-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            position: sticky;
            top: 0;
            z-index: 5;
            width: 36px;
            height: 36px;
            margin-bottom: 12px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-primary);
            color: var(--text-secondary);
            cursor: pointer;
            transition:
                color 0.15s ease,
                border-color 0.15s ease;

            &:hover {
                color: var(--text-primary);
                border-color: var(--text-muted);
            }
        }

        &__main {
            margin-left: 0;
            padding: 16px 16px;
        }
    }
}
</style>
