<template>
    <el-container class="app-layout">
        <AppSidebar :is-logged-in="isLoggedIn" :is-admin="isAdmin" @logout="handleLogout" />
        <el-main class="app-layout__main">
            <slot />
        </el-main>
    </el-container>
</template>

<script setup lang="ts">
const token = useCookie('auth_token');
const isLoggedIn = computed(() => !!token.value);
const userRole = ref('');

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

function handleLogout() {
    token.value = null;
    userRole.value = '';
    navigateTo('/login');
}
</script>

<style scoped lang="scss">
.app-layout {
    min-height: 100vh;

    &__main {
        margin-left: 240px;
        padding: 32px 40px;
        background: var(--bg-primary);
        min-height: 100vh;
    }
}
</style>
