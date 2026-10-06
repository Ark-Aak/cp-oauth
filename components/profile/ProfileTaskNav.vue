<template>
    <div class="profile-task-nav">
        <nav class="profile-task-nav__desktop" :aria-label="t('profile.workbench.tasks')">
            <p class="profile-task-nav__label">{{ t('profile.workbench.tasks') }}</p>
            <a
                v-for="task in PROFILE_TASKS"
                :key="task"
                :href="target(task)"
                class="profile-task-nav__link ui-menu-link"
                :class="{ 'is-active': modelValue === task }"
                :aria-current="modelValue === task ? 'page' : undefined"
                @click="selectLink(task, $event)"
                >{{ t(`profile.tabs.${task}`) }}</a
            >
        </nav>
        <div class="profile-task-nav__mobile">
            <label for="profile-task-select">{{ t('profile.workbench.tasks') }}</label>
            <el-select
                id="profile-task-select"
                :aria-label="t('profile.workbench.tasks')"
                :model-value="modelValue"
                @update:model-value="selectTask"
            >
                <el-option
                    v-for="task in PROFILE_TASKS"
                    :key="task"
                    :value="task"
                    :label="t(`profile.tabs.${task}`)"
                />
            </el-select>
        </div>
    </div>
</template>

<script setup lang="ts">
import { PROFILE_TASKS, type ProfileTask } from './profile-workbench';

const props = defineProps<{ modelValue: ProfileTask }>();
const emit = defineEmits<{ 'update:modelValue': [task: ProfileTask] }>();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
function target(task: ProfileTask) {
    return router.resolve({ path: '/profile', query: { ...route.query, tab: task } }).href;
}
function selectTask(value: unknown) {
    if (typeof value === 'string' && PROFILE_TASKS.includes(value as ProfileTask)) {
        emit('update:modelValue', value as ProfileTask);
    }
}
function selectLink(task: ProfileTask, event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
    event.preventDefault();
    if (props.modelValue !== task) emit('update:modelValue', task);
}
</script>

<style scoped lang="scss">
.profile-task-nav {
    min-width: 0;
    &__desktop {
        display: none;
    }
    &__mobile {
        display: grid;
        gap: var(--space-2);
    }
    &__label {
        margin: 0 0 var(--space-2);
        padding-inline: var(--space-4);
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        font-weight: 600;
    }
    &__mobile label {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        font-weight: 600;
    }
    &__mobile :deep(.el-select) {
        width: 100%;
    }
    @media (min-width: 1024px) {
        position: sticky;
        top: var(--space-5);
        align-self: start;
        max-height: calc(100dvh - var(--space-5) - var(--space-5));
        overflow-y: auto;

        &__mobile {
            display: none;
        }
        &__desktop {
            display: grid;
            gap: var(--space-1);
            padding: 4px;
        }
    }
}
</style>
