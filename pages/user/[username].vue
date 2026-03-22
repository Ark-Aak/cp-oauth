<template>
    <div v-if="user" class="user-profile">
        <!-- Header -->
        <div class="user-profile__header">
            <el-avatar :size="80" :src="user.avatarUrl || undefined" class="user-profile__avatar">
                {{ (user.displayName || user.username).charAt(0).toUpperCase() }}
            </el-avatar>
            <div class="user-profile__meta">
                <h1 class="user-profile__name">{{ user.displayName || user.username }}</h1>
                <p class="user-profile__handle">@{{ user.username }}</p>
                <p v-if="user.bio" class="user-profile__bio">{{ user.bio }}</p>
                <p class="user-profile__joined">
                    {{ $t('user.joined') }} {{ new Date(user.createdAt).toLocaleDateString() }}
                </p>
            </div>
        </div>

        <!-- Linked CP Accounts -->
        <el-card shadow="never" class="user-profile__section">
            <template #header>
                <span class="user-profile__section-title">{{ $t('user.linked_accounts') }}</span>
            </template>
            <el-empty :description="$t('user.no_linked')" :image-size="60" />
        </el-card>

        <!-- Homepage (Markdown) -->
        <el-card v-if="user.homepage" shadow="never" class="user-profile__section">
            <template #header>
                <span class="user-profile__section-title">{{ $t('user.homepage') }}</span>
            </template>
            <div v-if="renderedHtml" class="user-profile__markdown" v-html="renderedHtml" />
            <p v-else class="user-profile__loading-md">{{ $t('user.loading') }}</p>
        </el-card>
    </div>
    <el-empty v-else-if="error" :description="$t('user.not_found')" />
    <div v-else v-loading="true" class="user-profile__loading" />
</template>

<script setup lang="ts">
import { renderMarkdown } from '~/utils/markdown';

const route = useRoute();
const colorMode = useColorMode();

const username = route.params.username as string;

interface UserProfile {
    id: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    homepage: string | null;
    avatarUrl: string | null;
    createdAt: string;
}

const { data: user, error } = await useFetch<UserProfile>(`/api/users/${username}`);

const renderedHtml = ref('');

const currentTheme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'));

async function render() {
    if (!user.value?.homepage) {
        renderedHtml.value = '';
        return;
    }
    renderedHtml.value = await renderMarkdown(user.value.homepage, currentTheme.value);
}

watch(currentTheme, render);
watch(() => user.value?.homepage, render);
await render();
</script>

<style scoped lang="scss">
.user-profile {
    max-width: 720px;

    &__header {
        display: flex;
        gap: 20px;
        margin-bottom: 36px;
    }

    &__avatar {
        flex-shrink: 0;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-weight: 600;
        font-size: 24px;
    }

    &__meta {
        min-width: 0;
    }

    &__name {
        font-size: 24px;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: -0.02em;
    }

    &__handle {
        font-size: 14px;
        color: var(--text-muted);
        margin-top: 2px;
    }

    &__bio {
        font-size: 14px;
        color: var(--text-secondary);
        margin-top: 8px;
        line-height: 1.6;
    }

    &__joined {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 8px;
    }

    &__section {
        margin-bottom: 24px;
        border: 1px solid var(--border-color);
    }

    &__section-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
    }

    &__loading-md {
        font-size: 14px;
        color: var(--text-muted);
    }

    &__loading {
        min-height: 200px;
    }

    &__markdown {
        font-size: 14px;
        color: var(--text-primary);
        line-height: 1.8;

        :deep(h1),
        :deep(h2),
        :deep(h3) {
            font-weight: 600;
            color: var(--text-primary);
            margin: 20px 0 8px;
        }

        :deep(h1) {
            font-size: 22px;
        }
        :deep(h2) {
            font-size: 18px;
        }
        :deep(h3) {
            font-size: 16px;
        }

        :deep(p) {
            margin-bottom: 12px;
        }

        :deep(a) {
            color: var(--accent);
            text-decoration: underline;
        }

        :deep(code) {
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 13px;
            background: var(--bg-tertiary);
            padding: 2px 6px;
            border-radius: 3px;
        }

        :deep(pre) {
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow-x: auto;
            margin-bottom: 16px;

            code {
                background: none;
                padding: 0;
            }
        }

        :deep(.shiki) {
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
        }

        :deep(ul),
        :deep(ol) {
            padding-left: 20px;
            margin-bottom: 12px;
        }

        :deep(li) {
            margin-bottom: 4px;
        }

        :deep(blockquote) {
            border-left: 3px solid var(--border-color);
            padding-left: 16px;
            color: var(--text-secondary);
            margin-bottom: 12px;
        }

        :deep(img) {
            max-width: 100%;
            border-radius: 6px;
        }

        :deep(hr) {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 20px 0;
        }

        :deep(table) {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;

            th,
            td {
                border: 1px solid var(--border-color);
                padding: 8px 12px;
                text-align: left;
            }

            th {
                background: var(--bg-tertiary);
                font-weight: 600;
            }
        }
    }
}
</style>
