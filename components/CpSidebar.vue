<template>
    <div class="cp-rail">
        <NuxtLink
            to="/"
            class="cp-rail__brand"
            :aria-label="config.siteTitle"
            @click="emit('navigate')"
        >
            <span class="cp-rail__mark" aria-hidden="true">CP</span>
            <span class="cp-rail__title">{{ config.siteTitle }}</span>
        </NuxtLink>

        <nav class="cp-rail__nav" :aria-label="t('common.nav.label')">
            <div v-for="group in groups" :key="group.id" class="cp-rail__group">
                <p class="cp-rail__group-label">{{ group.label }}</p>
                <ul>
                    <li v-for="item in group.items" :key="item.to">
                        <NuxtLink
                            :to="item.to"
                            class="cp-rail__link"
                            :class="{ 'is-active': isActive(item) }"
                            :aria-current="isActive(item) ? 'page' : undefined"
                            @click="emit('navigate')"
                        >
                            <component
                                :is="item.icon"
                                :size="16"
                                :stroke-width="1.75"
                                aria-hidden="true"
                            />
                            <span>{{ item.label }}</span>
                        </NuxtLink>
                    </li>
                </ul>
            </div>
        </nav>

        <div class="cp-rail__foot">
            <div v-if="user" class="cp-rail__account">
                <NuxtLink
                    :to="`/user/${user.username}`"
                    class="cp-rail__identity"
                    :title="t('common.nav.publicProfile')"
                    @click="emit('navigate')"
                >
                    <CpAvatar
                        :src="user.avatarUrl"
                        :name="user.displayName || user.username"
                        :size="32"
                    />
                    <span class="cp-rail__who">
                        <span class="cp-rail__name">{{ user.displayName || user.username }}</span>
                        <span class="cp-rail__handle">@{{ user.username }}</span>
                    </span>
                </NuxtLink>
                <button
                    type="button"
                    class="cp-rail__icon-button"
                    :title="t('common.actions.signOut')"
                    :aria-label="t('common.actions.signOut')"
                    :disabled="signingOut"
                    @click="onSignOut"
                >
                    <LogOut :size="16" :stroke-width="1.75" aria-hidden="true" />
                </button>
            </div>
            <div v-else class="cp-rail__guest">
                <NuxtLink :to="signInTarget" class="cp-rail__cta" @click="emit('navigate')">
                    {{ t('common.actions.signIn') }}
                </NuxtLink>
                <NuxtLink
                    v-if="config.registrationEnabled"
                    to="/register"
                    class="cp-rail__secondary"
                    @click="emit('navigate')"
                >
                    {{ t('common.actions.createAccount') }}
                </NuxtLink>
            </div>
            <CpPreferences surface="rail" />
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    AppWindow,
    Blocks,
    BookOpen,
    Code2,
    House,
    Link2,
    LogOut,
    Megaphone,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    UserRound,
    UsersRound,
    Eye
} from 'lucide-vue-next';

interface NavItem {
    to: string;
    label: string;
    icon: unknown;
    path: string;
    tab?: string;
}

const emit = defineEmits<{ navigate: [] }>();
const { t } = useI18n();
const route = useRoute();
const { user, isAdmin, signOut } = useSession();
const { describe } = useApiError();
const { config } = usePublicConfig();
const signingOut = ref(false);

const signInTarget = computed(() =>
    route.path === '/' || route.path === '/login' ? '/login' : buildLoginPath(route.fullPath)
);

const profile = (tab: string, label: string, icon: unknown): NavItem => ({
    to: `/profile?tab=${tab}`,
    path: '/profile',
    tab,
    label,
    icon
});

const groups = computed(() => {
    const list: Array<{ id: string; label: string; items: NavItem[] }> = [
        {
            id: 'explore',
            label: t('common.nav.explore'),
            items: [
                { to: '/', path: '/', label: t('common.nav.home'), icon: House },
                {
                    to: '/showcase',
                    path: '/showcase',
                    label: t('common.nav.showcase'),
                    icon: Blocks
                },
                { to: '/about', path: '/about', label: t('common.nav.about'), icon: BookOpen }
            ]
        }
    ];
    if (user.value) {
        list.push(
            {
                id: 'account',
                label: t('common.nav.account'),
                items: [
                    profile('basic', t('common.nav.profile'), UserRound),
                    profile('security', t('common.nav.security'), ShieldCheck),
                    profile('bindings', t('common.nav.bindings'), Link2),
                    profile('apps', t('common.nav.apps'), AppWindow),
                    profile('privacy', t('common.nav.privacy'), Eye)
                ]
            },
            {
                id: 'develop',
                label: t('common.nav.develop'),
                items: [
                    {
                        to: '/developer',
                        path: '/developer',
                        label: t('common.nav.developer'),
                        icon: Code2
                    }
                ]
            }
        );
    }
    if (isAdmin.value) {
        list.push({
            id: 'admin',
            label: t('common.nav.admin'),
            items: [
                {
                    to: '/admin',
                    path: '/admin',
                    label: t('common.nav.adminUsers'),
                    icon: UsersRound
                },
                {
                    to: '/admin/config',
                    path: '/admin/config',
                    label: t('common.nav.adminConfig'),
                    icon: Settings2
                },
                {
                    to: '/admin/notices',
                    path: '/admin/notices',
                    label: t('common.nav.adminNotices'),
                    icon: Megaphone
                },
                {
                    to: '/admin/showcase',
                    path: '/admin/showcase',
                    label: t('common.nav.adminShowcase'),
                    icon: SlidersHorizontal
                }
            ]
        });
    }
    return list;
});

function isActive(item: NavItem): boolean {
    if (route.path !== item.path) return false;
    if (!item.tab) return true;
    const tab = typeof route.query.tab === 'string' ? route.query.tab : 'basic';
    return tab === item.tab;
}

async function onSignOut() {
    signingOut.value = true;
    try {
        await signOut();
        emit('navigate');
    } catch (cause) {
        ElMessage.error(describe(cause));
    } finally {
        signingOut.value = false;
    }
}
</script>

<style scoped lang="scss">
.cp-rail {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--cp-rail-fg);
    background: var(--cp-rail-bg);
}

.cp-rail__brand {
    display: flex;
    align-items: center;
    gap: var(--cp-space-3);
    height: 64px;
    padding: 0 var(--cp-space-5);
    color: var(--cp-rail-fg-strong);
    border-bottom: 1px solid var(--cp-rail-line);

    &:hover {
        color: var(--cp-rail-fg-strong);
        text-decoration: none;
    }
}

.cp-rail__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-xs);
    font-weight: var(--cp-weight-medium);
    letter-spacing: 0.02em;
    color: var(--cp-rail-bg);
    background: var(--cp-rail-accent);
    border-radius: var(--cp-radius-sm);
}

.cp-rail__title {
    overflow: hidden;
    font-size: var(--cp-text-lg);
    font-weight: var(--cp-weight-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.cp-rail__nav {
    flex: 1;
    min-height: 0;
    padding: var(--cp-space-4) var(--cp-space-3);
    overflow-y: auto;
}

.cp-rail__group + .cp-rail__group {
    margin-top: var(--cp-space-5);
}

.cp-rail__group-label {
    padding: 0 var(--cp-space-3) var(--cp-space-2);
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-xs);
    line-height: var(--cp-leading-xs);
    font-weight: var(--cp-weight-medium);
    letter-spacing: var(--cp-tracking-kicker);
    text-transform: uppercase;
    color: var(--cp-rail-muted);
}

.cp-rail__link {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--cp-space-3);
    height: 34px;
    padding: 0 var(--cp-space-3);
    font-size: var(--cp-text-md);
    color: var(--cp-rail-fg);
    border-radius: var(--cp-radius-sm);
    transition:
        color var(--cp-duration) var(--cp-ease),
        background-color var(--cp-duration) var(--cp-ease);

    &:hover {
        color: var(--cp-rail-fg-strong);
        background: var(--cp-rail-hover);
        text-decoration: none;
    }

    &:focus-visible {
        outline-color: var(--cp-rail-accent);
        outline-offset: -2px;
    }

    &.is-active {
        color: var(--cp-rail-fg-strong);
        background: var(--cp-rail-active);

        &::before {
            position: absolute;
            top: 8px;
            bottom: 8px;
            left: 0;
            width: 2px;
            content: '';
            background: var(--cp-rail-accent);
        }

        svg {
            color: var(--cp-rail-accent);
        }
    }
}

.cp-rail__foot {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-3);
    padding: var(--cp-space-4) var(--cp-space-4) var(--cp-space-5);
    border-top: 1px solid var(--cp-rail-line);
}

.cp-rail__account {
    display: flex;
    align-items: center;
    gap: var(--cp-space-2);
}

.cp-rail__identity {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--cp-space-3);
    min-width: 0;
    padding: var(--cp-space-1);
    margin: calc(var(--cp-space-1) * -1);
    color: inherit;
    border-radius: var(--cp-radius-sm);

    &:hover {
        color: inherit;
        background: var(--cp-rail-hover);
        text-decoration: none;
    }

    &:focus-visible {
        outline-color: var(--cp-rail-accent);
    }
}

.cp-rail__who {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.cp-rail__name,
.cp-rail__handle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.cp-rail__name {
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-rail-fg-strong);
}

.cp-rail__handle {
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-xs);
    line-height: var(--cp-leading-xs);
    color: var(--cp-rail-muted);
}

.cp-rail__icon-button {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--cp-rail-muted);
    background: transparent;
    border: 1px solid var(--cp-rail-line);
    border-radius: var(--cp-radius-sm);
    cursor: pointer;
    transition:
        color var(--cp-duration) var(--cp-ease),
        background-color var(--cp-duration) var(--cp-ease);

    &:hover {
        color: var(--cp-rail-fg-strong);
        background: var(--cp-rail-hover);
    }

    &:focus-visible {
        outline-color: var(--cp-rail-accent);
    }
}

.cp-rail__guest {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-2);
}

.cp-rail__cta,
.cp-rail__secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    font-size: var(--cp-text-md);
    font-weight: var(--cp-weight-medium);
    border-radius: var(--cp-radius-sm);
    transition:
        background-color var(--cp-duration) var(--cp-ease),
        color var(--cp-duration) var(--cp-ease);

    &:hover {
        text-decoration: none;
    }

    &:focus-visible {
        outline-color: var(--cp-rail-accent);
    }
}

.cp-rail__cta {
    color: var(--cp-rail-bg);
    background: var(--cp-rail-accent);

    &:hover {
        color: var(--cp-rail-bg);
        background: var(--cp-rail-fg-strong);
    }
}

.cp-rail__secondary {
    color: var(--cp-rail-fg);
    border: 1px solid var(--cp-rail-line);

    &:hover {
        color: var(--cp-rail-fg-strong);
        background: var(--cp-rail-hover);
    }
}
</style>
