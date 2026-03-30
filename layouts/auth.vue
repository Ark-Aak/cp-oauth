<template>
    <el-container class="auth-layout">
        <el-main class="auth-layout__main">
            <div class="auth-layout__content">
                <slot />
            </div>
            <AppFooter />
        </el-main>
    </el-container>
</template>

<style scoped lang="scss">
.auth-layout {
    min-height: 100vh;

    &__main {
        background: var(--bg-secondary);
        min-height: 100vh;
        padding: 28px 20px;
    }

    &__content {
        min-height: 100vh;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 15vh;
    }
}

@media (max-width: 768px) {
    .auth-layout {
        &__main {
            padding: 16px;
        }

        &__content {
            padding-top: 8vh;
        }
    }
}
</style>
