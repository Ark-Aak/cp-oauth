<template>
    <section class="profile-public" aria-labelledby="profile-public-title">
        <h2 id="profile-public-title">{{ t('profile.tabs.public') }}</h2>
        <p class="profile-public__intro">{{ t('profile.workbench.public_audience') }}</p>
        <p
            v-if="mutationError"
            ref="errorElement"
            class="profile-public__error"
            tabindex="-1"
            role="alert"
        >
            {{ mutationError }}
        </p>
        <p v-if="notice" class="profile-public__notice" role="status" aria-live="polite">
            {{ notice }}
        </p>
        <form class="profile-public__form" method="post" novalidate @submit.prevent="save">
            <section class="profile-public__section">
                <div class="profile-public__heading">
                    <label for="profile-public-homepage">{{ t('profile.homepage') }}</label>
                    <el-button
                        :aria-expanded="previewOpen"
                        aria-controls="profile-public-preview"
                        @click="previewOpen = !previewOpen"
                        >{{
                            t(
                                previewOpen
                                    ? 'profile.workbench.close_preview'
                                    : 'profile.workbench.preview'
                            )
                        }}</el-button
                    >
                </div>
                <p id="profile-public-homepage-hint" class="profile-public__hint">
                    {{ t('profile.workbench.homepage_public') }}
                </p>
                <AppInputFormatHint id="profile-public-homepage-format" format="markdown" />
                <el-input
                    id="profile-public-homepage"
                    v-model="draft.homepage"
                    :aria-label="t('profile.homepage')"
                    type="textarea"
                    :rows="8"
                    :disabled="!ready || pending"
                    :aria-invalid="!!fieldErrors.homepage"
                    aria-describedby="profile-public-homepage-format profile-public-homepage-hint profile-public-homepage-error"
                    class="profile-public__editor"
                />
                <p
                    v-if="fieldErrors.homepage"
                    id="profile-public-homepage-error"
                    class="profile-public__error"
                >
                    {{ fieldErrors.homepage }}
                </p>
                <section
                    v-if="previewOpen"
                    id="profile-public-preview"
                    class="profile-public__preview-region"
                    aria-labelledby="profile-preview-title"
                >
                    <h3 id="profile-preview-title">{{ t('profile.workbench.preview') }}</h3>
                    <AppAsyncState
                        :pending="previewPending"
                        :error="previewError"
                        :empty="!draft.homepage"
                        :empty-text="t('profile.workbench.preview_empty')"
                        :empty-icon="FileText"
                        @retry="retryPreview"
                    >
                        <div class="profile-public__preview" v-html="previewHtml" />
                    </AppAsyncState>
                </section>
            </section>

            <fieldset class="profile-public__section profile-public__accounts">
                <legend>{{ t('profile.public_accounts') }}</legend>
                <p class="profile-public__hint">{{ t('profile.public_accounts_hint') }}</p>
                <AppAsyncState
                    :pending="bindingsStatus === 'idle' || bindingsStatus === 'pending'"
                    :error="bindingsError"
                    @retry="loadBindings(true)"
                >
                    <div
                        v-if="bindingsStatus === 'success' && !bindings.length"
                        class="profile-public__empty"
                    >
                        <p>
                            <Link2 :size="18" aria-hidden="true" />
                            {{ t('profile.no_accounts_to_show') }}
                        </p>
                        <NuxtLink
                            :to="{ path: '/profile', query: { ...route.query, tab: 'bindings' } }"
                            class="el-button"
                            >{{ t('binding.link_account') }}</NuxtLink
                        >
                    </div>
                    <el-checkbox-group
                        v-else
                        v-model="draft.publicLinkedPlatforms"
                        class="profile-public__account-list"
                        :disabled="!ready || pending"
                    >
                        <el-checkbox
                            v-for="account in bindings"
                            :key="account.id"
                            :value="account.platform"
                            class="profile-public__account"
                        >
                            <span class="profile-public__account-identity">
                                <AppPlatformIcon :platform="account.platform" />
                                <span>
                                    <strong>{{
                                        t(PLATFORMS[account.platform].translationKey)
                                    }}</strong>
                                    <span class="profile-public__account-name">{{
                                        account.platformUsername || account.platformUid
                                    }}</span>
                                </span>
                            </span>
                        </el-checkbox>
                    </el-checkbox-group>
                </AppAsyncState>
                <p v-if="fieldErrors.publicLinkedPlatforms" class="profile-public__error">
                    {{ fieldErrors.publicLinkedPlatforms }}
                </p>
            </fieldset>

            <section class="profile-public__section" aria-labelledby="profile-public-stats-title">
                <h3 id="profile-public-stats-title">
                    {{ t('profile.workbench.public_statistics') }}
                </h3>
                <p v-if="bindingsStatus === 'success' && !clistLinked" class="profile-public__hint">
                    {{ t('profile.workbench.clist_required') }}
                    <NuxtLink
                        :to="{ path: '/profile', query: { ...route.query, tab: 'bindings' } }"
                        >{{ t('profile.tabs.bindings') }}</NuxtLink
                    >
                </p>
                <div class="profile-public__option">
                    <el-checkbox
                        v-model="draft.publicCpStats"
                        :disabled="!ready || pending"
                        aria-describedby="profile-public-stats-hint"
                        >{{ t('profile.public_cp_stats') }}</el-checkbox
                    >
                    <p id="profile-public-stats-hint" class="profile-public__hint">
                        {{ t('profile.public_cp_stats_hint') }}
                    </p>
                </div>
                <div class="profile-public__option">
                    <el-checkbox
                        v-model="draft.publicRatingHistory"
                        :disabled="!ready || pending"
                        aria-describedby="profile-public-history-hint"
                        >{{ t('profile.public_rating_history') }}</el-checkbox
                    >
                    <p id="profile-public-history-hint" class="profile-public__hint">
                        {{ t('profile.public_rating_history_hint') }}
                    </p>
                </div>
                <p
                    v-if="fieldErrors.publicCpStats || fieldErrors.publicRatingHistory"
                    class="profile-public__error"
                >
                    {{ fieldErrors.publicCpStats || fieldErrors.publicRatingHistory }}
                </p>
                <p class="profile-public__hint">{{ t('profile.workbench.oauth_visibility') }}</p>
            </section>
            <div class="profile-public__actions">
                <el-button
                    type="primary"
                    native-type="submit"
                    :loading="saving"
                    :disabled="!ready || pending || !dirty"
                    >{{ t(saving ? 'profile.saving' : 'profile.save') }}</el-button
                >
            </div>
        </form>
    </section>
</template>

<script setup lang="ts">
import { FileText, Link2 } from 'lucide-vue-next';
import type { MeResponse } from '~/types/api';
import type { ProfileIdentityPatch } from '~/composables/useProfileIdentity';
import { PLATFORMS } from '~/utils/platforms';
import { profileError, useProfileTaskGuard } from './profile-workbench';

const { t } = useI18n();
const route = useRoute();
const ready = ref(false);
const { profile, saveDirty, saving, pending, mutationError, fieldErrors, clearFailure } =
    useProfileIdentity();
const { bindings, status: bindingsStatus, error: bindingsError, load } = useProfileBindings();
function values(user: MeResponse | null) {
    return {
        homepage: user?.homepage || '',
        publicLinkedPlatforms: [...(user?.publicLinkedPlatforms || [])],
        publicCpStats: user?.publicCpStats || false,
        publicRatingHistory: user?.publicRatingHistory || false
    };
}
const draft = reactive(values(profile.value));
const saved = ref(values(profile.value));
const dirty = computed(
    () =>
        draft.homepage !== saved.value.homepage ||
        draft.publicCpStats !== saved.value.publicCpStats ||
        draft.publicRatingHistory !== saved.value.publicRatingHistory ||
        draft.publicLinkedPlatforms.length !== saved.value.publicLinkedPlatforms.length ||
        draft.publicLinkedPlatforms.some(
            platform => !saved.value.publicLinkedPlatforms.includes(platform)
        )
);
const clistLinked = computed(() => bindings.value.some(account => account.platform === 'clist'));
const notice = ref('');
const errorElement = ref<HTMLElement>();
const previewOpen = ref(false);
const previewHtml = ref('');
const previewPending = ref(false);
const previewError = ref<string | null>(null);
let previewSequence = 0;
let previewTimer: ReturnType<typeof setTimeout> | undefined;

useProfileTaskGuard({ dirty: () => dirty.value, pending: () => pending.value });
async function loadBindings(force = false) {
    try {
        await load(force);
    } catch {
        /* The account block presents its own retryable error. */
    }
}
onMounted(() => {
    ready.value = true;
    void loadBindings();
});
watch(
    () => profile.value?.id,
    () => {
        Object.assign(draft, values(profile.value));
        saved.value = values(profile.value);
        notice.value = '';
        clearFailure();
    }
);

async function renderPreview(sequence: number, source: string) {
    try {
        const { renderMarkdown } = await import('~/utils/markdown');
        const html = source ? await renderMarkdown(source) : '';
        if (sequence === previewSequence && previewOpen.value) previewHtml.value = html;
    } catch (cause) {
        if (sequence === previewSequence && previewOpen.value) {
            previewError.value = profileError(cause, t('markdown.render_error'));
        }
    } finally {
        if (sequence === previewSequence) previewPending.value = false;
    }
}
watch(
    [previewOpen, () => draft.homepage],
    () => {
        const sequence = ++previewSequence;
        clearTimeout(previewTimer);
        previewError.value = null;
        if (!previewOpen.value) {
            previewPending.value = false;
            previewHtml.value = '';
            return;
        }
        previewPending.value = true;
        const source = draft.homepage;
        previewTimer = setTimeout(() => {
            void renderPreview(sequence, source);
        }, 250);
    },
    { flush: 'sync' }
);
function retryPreview() {
    clearTimeout(previewTimer);
    previewError.value = null;
    previewPending.value = true;
    void renderPreview(++previewSequence, draft.homepage);
}
async function save() {
    if (pending.value || !dirty.value) return;
    notice.value = '';
    const patch: ProfileIdentityPatch = {};
    if (draft.homepage !== saved.value.homepage) patch.homepage = draft.homepage;
    if (draft.publicCpStats !== saved.value.publicCpStats)
        patch.publicCpStats = draft.publicCpStats;
    if (draft.publicRatingHistory !== saved.value.publicRatingHistory)
        patch.publicRatingHistory = draft.publicRatingHistory;
    if (
        draft.publicLinkedPlatforms.length !== saved.value.publicLinkedPlatforms.length ||
        draft.publicLinkedPlatforms.some(
            platform => !saved.value.publicLinkedPlatforms.includes(platform)
        )
    ) {
        patch.publicLinkedPlatforms = [...draft.publicLinkedPlatforms];
    }
    try {
        const updated = await saveDirty(patch);
        saved.value = values(updated);
        Object.assign(draft, values(updated));
        notice.value = t('profile.updated');
    } catch {
        await nextTick();
        if (fieldErrors.value.homepage) document.getElementById('profile-public-homepage')?.focus();
        else errorElement.value?.focus();
    }
}
onBeforeUnmount(() => {
    previewSequence++;
    clearTimeout(previewTimer);
    previewHtml.value = '';
});
</script>

<style scoped lang="scss">
.profile-public {
    min-width: 0;
    &__intro {
        margin: var(--space-2) 0 var(--space-4);
        color: var(--text-secondary);
    }
    &__hint {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        margin: var(--space-2) 0;
    }
    &__form {
        display: grid;
        gap: var(--space-5);
        justify-items: start;
        margin-top: var(--space-4);
    }
    &__section {
        width: 100%;
        min-width: 0;
    }
    &__section + &__section {
        border-top: 1px solid var(--border-color);
        padding-top: var(--space-5);
    }
    &__heading {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
    }
    &__heading label,
    &__accounts legend {
        font-weight: 600;
        font-size: var(--font-size-subheading);
    }
    &__editor {
        :deep(textarea) {
            font-family: var(--font-code);
            line-height: 1.65;
        }
    }
    &__accounts {
        margin: 0;
        padding: 0;
        border: 0;
    }
    &__empty {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3);
        margin-top: var(--space-3);
    }
    &__empty p {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        color: var(--text-secondary);
    }
    &__empty svg {
        flex-shrink: 0;
    }
    &__empty .el-button {
        max-width: 100%;
        height: auto;
        min-height: 44px;
        white-space: normal;
    }
    &__account-list {
        display: grid;
        gap: var(--space-2);
    }
    &__account {
        margin: 0;
        height: auto;
        min-height: 44px;
        :deep(.el-checkbox__label) {
            white-space: normal;
            min-width: 0;
            width: 100%;
        }
    }
    &__account-identity {
        display: flex;
        gap: var(--space-3);
        align-items: center;
        overflow-wrap: anywhere;
    }
    &__account-name {
        display: block;
        color: var(--text-secondary);
        font-size: var(--font-size-meta);
    }
    &__option {
        margin-top: var(--space-4);
        :deep(.el-checkbox) {
            height: auto;
            min-height: 44px;
        }
        :deep(.el-checkbox__label) {
            white-space: normal;
        }
    }
    &__error {
        color: var(--el-color-danger);
        overflow-wrap: anywhere;
        margin: var(--space-2) 0;
    }
    &__notice {
        padding: var(--space-2) var(--space-3);
        border-left: 2px solid var(--accent);
        background: var(--accent-subtle);
        overflow-wrap: anywhere;
    }
    &__actions {
        width: 100%;
        padding: var(--space-3) 0;
        border-top: 1px solid var(--border-color);
        background: var(--card-bg);
    }
    &__preview-region {
        margin-top: var(--space-4);
        padding-top: var(--space-4);
        border-top: 1px solid var(--border-color);
        min-width: 0;
    }
    &__preview-region h3 {
        margin: 0 0 var(--space-3);
    }
    &__preview {
        overflow-wrap: anywhere;
        :deep(img) {
            max-width: 100%;
            height: auto;
        }
        :deep(pre) {
            max-width: 100%;
            overflow-x: auto;
            padding: var(--space-4);
            border-radius: var(--card-radius);
        }
        :deep(table) {
            display: block;
            max-width: 100%;
            overflow-x: auto;
            border-collapse: collapse;
        }
        :deep(th),
        :deep(td) {
            padding: var(--space-2);
            border: 1px solid var(--border-color);
        }
        :deep(blockquote) {
            margin-left: 0;
            padding-left: var(--space-4);
            border-left: 2px solid var(--border-color);
        }
    }
    @media (max-width: 479px) {
        &__actions > :deep(.el-button) {
            width: 100%;
        }
    }
}
</style>
