<template>
    <el-container class="auth-layout">
        <el-main class="auth-layout__main">
            <slot />
        </el-main>
    </el-container>
</template>

<style scoped lang="scss">
.auth-layout {
    min-height: 100vh;

    &__main {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: var(--bg-primary);
    }
}
</style>
