<template>
    <div class="home">
        <h1 class="home__title">{{ $t('home.title') }}</h1>
        <p class="home__subtitle">{{ $t('home.subtitle') }}</p>

        <section class="home__section">
            <h2 class="home__section-title">{{ $t('home.recent_users') }}</h2>
            <div v-loading="pending">
                <div v-if="users && users.length" class="home__users">
                    <NuxtLink
                        v-for="u in users"
                        :key="u.id"
                        :to="`/user/${u.username}`"
                        class="home__user-card"
                    >
                        <el-avatar :size="44" :src="u.avatarUrl || undefined" class="home__avatar">
                            {{ (u.displayName || u.username).charAt(0).toUpperCase() }}
                        </el-avatar>
                        <div class="home__user-info">
                            <p class="home__user-name">{{ u.displayName || u.username }}</p>
                            <p class="home__user-handle">@{{ u.username }}</p>
                            <p v-if="u.bio" class="home__user-bio">{{ u.bio }}</p>
                        </div>
                    </NuxtLink>
                </div>
                <el-empty v-else-if="!pending" :description="$t('home.no_users')" />
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
interface UserSummary {
    id: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    createdAt: string;
}

const { data: users, pending } = await useFetch<UserSummary[]>('/api/users');
</script>

<style scoped lang="scss">
.home {
    max-width: 720px;

    &__title {
        font-size: 24px;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: -0.02em;
    }

    &__subtitle {
        color: var(--text-secondary);
        margin-top: 4px;
        font-size: 15px;
        margin-bottom: 40px;
    }

    &__section-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 16px;
    }

    &__users {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    &__user-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        border-radius: 8px;
        transition: background 0.15s ease;

        &:hover {
            background: var(--bg-secondary);
        }
    }

    &__avatar {
        flex-shrink: 0;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-weight: 600;
    }

    &__user-info {
        min-width: 0;
    }

    &__user-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-primary);
    }

    &__user-handle {
        font-size: 12px;
        color: var(--text-muted);
    }

    &__user-bio {
        font-size: 13px;
        color: var(--text-secondary);
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}
</style>
