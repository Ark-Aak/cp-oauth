<template>
    <el-dialog
        :model-value="pending !== null"
        :title="t('connections.avatar.title')"
        width="min(480px, calc(100vw - 32px))"
        append-to-body
        destroy-on-close
        :close-on-click-modal="false"
        :close-on-press-escape="!busy"
        :show-close="!busy"
        @update:model-value="value => !value && dismiss()"
    >
        <div v-if="pending" class="linked-avatar">
            <p>{{ t('connections.avatar.description', { platform: platformName }) }}</p>
            <div class="linked-avatar__comparison">
                <figure v-if="pending.previousUrl && !previousFailed" class="linked-avatar__image">
                    <img
                        :src="pending.previousUrl"
                        :alt="t('connections.avatar.before')"
                        width="88"
                        height="88"
                        referrerpolicy="no-referrer"
                        @error="previousFailed = true"
                    />
                    <figcaption>{{ t('connections.avatar.before') }}</figcaption>
                </figure>
                <figure v-if="!nextFailed" class="linked-avatar__image">
                    <img
                        :src="pending.avatarUrl"
                        :alt="t('connections.avatar.after', { platform: platformName })"
                        width="88"
                        height="88"
                        referrerpolicy="no-referrer"
                        @load="nextLoaded = true"
                        @error="nextFailed = true"
                    />
                    <figcaption>
                        {{ t('connections.avatar.after', { platform: platformName }) }}
                    </figcaption>
                </figure>
            </div>
            <CpNote v-if="nextFailed" tone="warning">{{
                t('connections.avatar.imageFailed')
            }}</CpNote>
            <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
            <div class="linked-avatar__actions">
                <el-button :disabled="busy" @click="dismiss">{{
                    t('connections.avatar.keep')
                }}</el-button>
                <el-button
                    type="primary"
                    :loading="busy"
                    :disabled="busy || nextFailed || !nextLoaded"
                    @click="save"
                >
                    {{ t('connections.avatar.use') }}
                </el-button>
            </div>
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
import type { MeResponse } from '~/types/api';
import { PLATFORMS } from '~/utils/platforms';

const { t } = useI18n();
const { pending } = useLinkedAvatar();
const session = useSession();
const api = useApi();
const { describe } = useApiError();
const busy = ref(false);
const error = ref('');
const previousFailed = ref(false);
const nextFailed = ref(false);
const nextLoaded = ref(false);
const platformName = computed(() => (pending.value ? PLATFORMS[pending.value.provider].name : ''));

watch(pending, () => {
    previousFailed.value = false;
    nextFailed.value = false;
    nextLoaded.value = false;
    error.value = '';
});
watch(
    () => session.user.value?.id,
    id => {
        if (pending.value && pending.value.userId !== id) pending.value = null;
    }
);

function dismiss() {
    if (!busy.value) pending.value = null;
}

async function save() {
    const suggestion = pending.value;
    if (
        !suggestion ||
        busy.value ||
        nextFailed.value ||
        !nextLoaded.value ||
        session.user.value?.id !== suggestion.userId
    )
        return;
    busy.value = true;
    error.value = '';
    try {
        const user = await api<MeResponse>('/api/auth/me', {
            method: 'PATCH',
            body: { avatarUrl: suggestion.avatarUrl }
        });
        if (session.user.value?.id === suggestion.userId) session.setUser(user);
        if (pending.value === suggestion) pending.value = null;
        ElMessage.success(t('connections.avatar.saved'));
    } catch (cause) {
        error.value = describe(cause);
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped lang="scss">
.linked-avatar {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}
.linked-avatar__comparison {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--cp-space-6);
}
.linked-avatar__image {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--cp-space-2);
    margin: 0;
    font-size: var(--cp-text-sm);
    color: var(--cp-text-2);
    img {
        object-fit: cover;
        border-radius: var(--cp-radius-sm);
    }
}
.linked-avatar__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--cp-space-2);
}
</style>
