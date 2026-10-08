<template>
    <div class="profile-workbench">
        <AppPageHeader
            :title="t('profile.title')"
            :description="t('profile.workbench.description')"
        >
            <template #actions>
                <NuxtLink v-if="returnTask" :to="returnTask" class="el-button">{{
                    t('profile.workbench.return_task')
                }}</NuxtLink>
                <NuxtLink v-if="user?.username" :to="`/user/${user.username}`" class="el-button">{{
                    t('profile.view_public')
                }}</NuxtLink>
            </template>
        </AppPageHeader>
        <p v-if="status === 'anonymous'" class="profile-workbench__session" role="alert">
            <NuxtLink :to="buildLoginPath(route.fullPath)">{{
                t('reauth.session_expired')
            }}</NuxtLink>
        </p>
        <div v-if="user && error" class="profile-workbench__error" role="alert">
            <p>{{ error }}</p>
            <el-button @click="retryIdentity">{{ t('common.retry') }}</el-button>
        </div>
        <p
            v-if="navigationError"
            ref="navigationErrorElement"
            class="profile-workbench__error"
            tabindex="-1"
            role="alert"
        >
            {{ navigationError }}
        </p>
        <AppAsyncState
            :pending="status === 'unknown' && !user"
            :error="!user ? error : null"
            @retry="retryIdentity"
        >
            <div v-if="user" class="profile-workbench__layout">
                <ProfileTaskNav :model-value="activeTask" @update:model-value="selectTask" />
                <div id="profile-active-panel" class="profile-workbench__panel task-panel">
                    <ProfileIdentityPanel v-if="activeTask === 'basic'" />
                    <ProfileBindingsPanel v-else-if="activeTask === 'bindings'" />
                    <ProfileSecurityPanel v-else-if="activeTask === 'security'" />
                    <ProfileAuthorizedAppsPanel v-else-if="activeTask === 'authorized_apps'" />
                    <ProfilePublicPanel v-else-if="activeTask === 'public'" />
                    <section
                        v-else
                        class="profile-workbench__preferences"
                        aria-labelledby="profile-preferences-title"
                    >
                        <h2 id="profile-preferences-title">{{ t('profile.tabs.preferences') }}</h2>
                        <p>{{ t('profile.workbench.preferences_hint') }}</p>
                        <AppPreferences />
                    </section>
                </div>
            </div>
        </AppAsyncState>
    </div>
</template>

<script setup lang="ts">
import { getCurrentInstance } from 'vue';
import { ElMessageBox } from 'element-plus';
import ProfileTaskNav from '~/components/profile/ProfileTaskNav.vue';
import ProfileIdentityPanel from '~/components/profile/ProfileIdentityPanel.vue';
import ProfileBindingsPanel from '~/components/profile/ProfileBindingsPanel.vue';
import ProfileSecurityPanel from '~/components/profile/ProfileSecurityPanel.vue';
import ProfileAuthorizedAppsPanel from '~/components/profile/ProfileAuthorizedAppsPanel.vue';
import ProfilePublicPanel from '~/components/profile/ProfilePublicPanel.vue';
import {
    PROFILE_TASKS,
    PROFILE_TASK_GUARD,
    profileError,
    type ProfileTask,
    type ProfileTaskGuard
} from '~/components/profile/profile-workbench';
import { buildLoginPath, getSafeRedirectTarget } from '~/utils/auth-redirect';

definePageMeta({ middleware: 'auth' });
const { t } = useI18n();
const messageBoxContext = getCurrentInstance()?.appContext;
const route = useRoute();
const router = useRouter();
const auth = useAuth();
const { user, status, error } = auth;
const activeGuard = shallowRef<ProfileTaskGuard | null>(null);
const navigationError = ref<string | null>(null);
const navigationErrorElement = ref<HTMLElement>();
const activeTask = computed(() => taskFromQuery(route.query.tab));
const returnTask = computed(() => getSafeRedirectTarget(route.query.redirect, ''));
useHead({ title: () => `${t('profile.title')} - CP OAuth` });

function taskFromQuery(value: unknown): ProfileTask {
    return typeof value === 'string' && PROFILE_TASKS.includes(value as ProfileTask)
        ? (value as ProfileTask)
        : 'basic';
}
provide(PROFILE_TASK_GUARD, guard => {
    activeGuard.value = guard;
    return () => {
        if (activeGuard.value === guard) activeGuard.value = null;
    };
});

let departure: Promise<boolean> | null = null;
async function permitDeparture(): Promise<boolean> {
    if (departure) return departure;
    const guard = activeGuard.value;
    navigationError.value = null;
    if (!guard) return true;
    if (guard.pending?.()) {
        navigationError.value = t('profile.workbench.wait_for_action');
        await nextTick();
        navigationErrorElement.value?.focus();
        return false;
    }
    departure = (async () => {
        try {
            if (guard.dirty?.()) {
                await ElMessageBox.confirm(
                    t('profile.workbench.discard_prompt'),
                    t('profile.workbench.unsaved_title'),
                    {
                        type: 'warning',
                        confirmButtonText: t('profile.workbench.discard'),
                        cancelButtonText: t('profile.workbench.keep_editing')
                    },
                    messageBoxContext
                );
            }
            await guard.beforeLeave?.();
            return true;
        } catch (cause) {
            if (cause !== 'cancel' && cause !== 'close') {
                navigationError.value = profileError(cause, t('common.error'));
                await nextTick();
                navigationErrorElement.value?.focus();
            }
            return false;
        } finally {
            departure = null;
        }
    })();
    return departure;
}
onBeforeRouteUpdate((to, from) =>
    taskFromQuery(to.query.tab) === taskFromQuery(from.query.tab) ? true : permitDeparture()
);
onBeforeRouteLeave(() => permitDeparture());

async function selectTask(task: ProfileTask) {
    if (task !== activeTask.value) {
        await router.push({ path: '/profile', query: { ...route.query, tab: task } });
    }
}
async function retryIdentity() {
    try {
        await auth.load(true);
    } catch {
        /* The shared identity state keeps the retryable failure. */
    }
}
function beforeUnload(event: BeforeUnloadEvent) {
    const guard = activeGuard.value;
    if (!guard?.dirty?.() && !guard?.pending?.()) return;
    event.preventDefault();
    event.returnValue = '';
}
watch(
    () => route.query.tab,
    value => {
        if (value !== undefined && taskFromQuery(value) !== value) {
            void router.replace({ path: '/profile', query: { ...route.query, tab: 'basic' } });
        }
    }
);
onMounted(() => {
    window.addEventListener('beforeunload', beforeUnload);
    const value = route.query.tab;
    if (value !== undefined && taskFromQuery(value) !== value) {
        void router.replace({ path: '/profile', query: { ...route.query, tab: 'basic' } });
    }
});
onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<style scoped lang="scss">
.profile-workbench {
    min-width: 0;
    &__layout {
        display: grid;
        gap: var(--space-5);
        align-items: start;
    }
    &__panel {
        min-width: 0;
        width: 100%;
        max-width: none;
    }
    &__error {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3);
        color: var(--el-color-danger);
        margin-bottom: var(--space-4);
        overflow-wrap: anywhere;
    }
    &__session {
        margin-bottom: var(--space-4);
    }
    &__preferences p {
        margin: var(--space-2) 0 var(--space-4);
        color: var(--text-secondary);
    }
    @media (max-width: 767px) {
        &__layout {
            gap: var(--space-4);
        }
    }
    @media (min-width: 1024px) {
        &__layout {
            grid-template-columns: 180px minmax(0, 1fr);
        }
        &__panel {
            min-height: 240px;
        }
    }
}
</style>
