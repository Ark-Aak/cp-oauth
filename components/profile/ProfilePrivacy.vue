<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.account')"
            :title="t('common.nav.privacy')"
            :description="t('account.privacy.description')"
        >
            <template #actions>
                <el-button @click="navigateTo(`/user/${me.username}`)">
                    {{ t('common.nav.publicProfile') }}
                </el-button>
            </template>
        </CpPageHeader>

        <div class="cp-stack">
            <CpSheet
                :title="t('account.privacy.visibilityTitle')"
                :description="t('account.privacy.visibilityText')"
            >
                <form class="privacy-form" method="post" novalidate @submit.prevent="save">
                    <fieldset class="privacy-form__group">
                        <legend>{{ t('account.privacy.platformsLegend') }}</legend>
                        <CpDataState
                            :pending="bindingsPending"
                            :error="bindingsError ? describe(bindingsError) : null"
                            :empty="!bindings?.length"
                            :rows="2"
                            @retry="refreshBindings"
                        >
                            <template #empty>
                                <p class="cp-help">
                                    {{ t('account.privacy.noBindings') }}
                                    <NuxtLink to="/profile?tab=bindings">{{
                                        t('common.nav.bindings')
                                    }}</NuxtLink>
                                </p>
                            </template>
                            <ul class="privacy-form__platforms">
                                <li v-for="account in bindings" :key="account.platform">
                                    <el-checkbox
                                        :model-value="publicPlatforms.includes(account.platform)"
                                        :disabled="!hydrated || saving"
                                        @update:model-value="
                                            value =>
                                                togglePlatform(account.platform, Boolean(value))
                                        "
                                    >
                                        <span class="privacy-form__platform">
                                            <CpPlatformMark :platform="account.platform" />
                                            <span class="cp-mono cp-muted">
                                                {{
                                                    account.platformUsername || account.platformUid
                                                }}
                                            </span>
                                        </span>
                                    </el-checkbox>
                                </li>
                            </ul>
                        </CpDataState>
                    </fieldset>

                    <div class="privacy-form__switches">
                        <div class="privacy-form__switch">
                            <div>
                                <p class="privacy-form__label">
                                    {{ t('account.privacy.cpStats') }}
                                </p>
                                <p class="cp-help">{{ t('account.privacy.cpStatsText') }}</p>
                            </div>
                            <el-switch
                                v-model="publicCpStats"
                                :aria-label="t('account.privacy.cpStats')"
                                :disabled="!hydrated || saving"
                            />
                        </div>
                        <div class="privacy-form__switch">
                            <div>
                                <p class="privacy-form__label">
                                    {{ t('account.privacy.ratingHistory') }}
                                </p>
                                <p class="cp-help">{{ t('account.privacy.ratingHistoryText') }}</p>
                            </div>
                            <el-switch
                                v-model="publicRatingHistory"
                                :aria-label="t('account.privacy.ratingHistory')"
                                :disabled="!hydrated || saving"
                            />
                        </div>
                    </div>

                    <CpNote v-if="saveError" tone="danger">{{ saveError }}</CpNote>
                    <div class="privacy-form__actions">
                        <el-button :disabled="!dirty || saving" @click="reset">
                            {{ t('common.actions.cancel') }}
                        </el-button>
                        <el-button
                            type="primary"
                            native-type="submit"
                            :loading="saving"
                            :disabled="!hydrated || !dirty"
                        >
                            {{ t('common.actions.saveChanges') }}
                        </el-button>
                    </div>
                </form>
            </CpSheet>

            <CpSheet
                :title="t('account.privacy.cardTitle')"
                :description="t('account.privacy.cardText')"
            >
                <div class="privacy-card">
                    <div class="privacy-card__controls">
                        <div class="privacy-card__control">
                            <span class="privacy-form__label">{{
                                t('common.preferences.theme')
                            }}</span>
                            <el-segmented
                                v-model="cardTheme"
                                :options="themeOptions"
                                size="small"
                            />
                        </div>
                        <div class="privacy-card__control">
                            <span class="privacy-form__label">{{
                                t('common.preferences.language')
                            }}</span>
                            <el-segmented v-model="cardLang" :options="langOptions" size="small" />
                        </div>
                        <div class="privacy-card__control privacy-card__control--wide">
                            <span :id="ids.width" class="privacy-form__label">
                                {{ t('account.privacy.cardWidth', { width: cardWidth }) }}
                            </span>
                            <el-slider
                                v-model="cardWidth"
                                :min="300"
                                :max="800"
                                :step="20"
                                :aria-labelledby="ids.width"
                            />
                        </div>
                    </div>
                    <div class="privacy-card__preview" :class="{ 'is-dark': cardTheme === 'dark' }">
                        <img
                            :src="cardPath"
                            :width="cardWidth"
                            :alt="t('account.privacy.cardAlt', { username: me.username })"
                        />
                    </div>
                    <dl>
                        <CpField :label="t('account.privacy.markdownSnippet')">
                            <CpCode :value="markdownSnippet" block />
                        </CpField>
                        <CpField :label="t('account.privacy.htmlSnippet')">
                            <CpCode :value="htmlSnippet" block />
                        </CpField>
                    </dl>
                </div>
            </CpSheet>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { LinkedAccount, MeResponse } from '~/types/api';
import type { Platform } from '~/utils/platforms';

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();
const hydrated = useHydrated();
const session = useSession();
const origin = useRequestURL().origin;

const me = computed(() => session.user.value as MeResponse);
const ids = { width: useId() };

const {
    data: bindings,
    pending: bindingsPending,
    error: bindingsError,
    refresh: refreshBindings
} = await useAsyncData('profile-privacy-bindings', () =>
    api<LinkedAccount[]>('/api/account/bindings')
);

const publicPlatforms = ref<Platform[]>([]);
const publicCpStats = ref(false);
const publicRatingHistory = ref(false);
const saving = ref(false);
const saveError = ref('');

function reset() {
    publicPlatforms.value = [...me.value.publicLinkedPlatforms];
    publicCpStats.value = me.value.publicCpStats;
    publicRatingHistory.value = me.value.publicRatingHistory;
    saveError.value = '';
}
reset();

function togglePlatform(platform: Platform, on: boolean) {
    publicPlatforms.value = on
        ? [...new Set([...publicPlatforms.value, platform])]
        : publicPlatforms.value.filter(item => item !== platform);
}

const linkedSet = computed(() => new Set((bindings.value ?? []).map(item => item.platform)));
const effectivePlatforms = computed(() =>
    publicPlatforms.value.filter(item => linkedSet.value.has(item))
);

const dirty = computed(() => {
    const saved = me.value.publicLinkedPlatforms
        .filter(item => linkedSet.value.has(item))
        .sort()
        .join();
    return (
        saved !== [...effectivePlatforms.value].sort().join() ||
        publicCpStats.value !== me.value.publicCpStats ||
        publicRatingHistory.value !== me.value.publicRatingHistory
    );
});

async function save() {
    saving.value = true;
    saveError.value = '';
    try {
        session.setUser(
            await api<MeResponse>('/api/auth/me', {
                method: 'PATCH',
                body: {
                    publicLinkedPlatforms: effectivePlatforms.value,
                    publicCpStats: publicCpStats.value,
                    publicRatingHistory: publicRatingHistory.value
                }
            })
        );
        reset();
        ElMessage.success(t('common.states.saved'));
    } catch (error) {
        saveError.value = describe(error);
    } finally {
        saving.value = false;
    }
}

/* Embeddable card */
const cardTheme = ref<'light' | 'dark'>('light');
const cardLang = ref<'en' | 'zh' | 'ja'>('en');
const cardWidth = ref(480);
const themeOptions = computed(() => [
    { label: t('common.preferences.light'), value: 'light' },
    { label: t('common.preferences.dark'), value: 'dark' }
]);
const langOptions = [
    { label: 'English', value: 'en' },
    { label: '中文', value: 'zh' },
    { label: '日本語', value: 'ja' }
];

const cardPath = computed(() => {
    const query = new URLSearchParams({
        theme: cardTheme.value,
        lang: cardLang.value,
        width: String(cardWidth.value)
    });
    return `/api/users/${encodeURIComponent(me.value.username)}/card.svg?${query}`;
});
const cardUrl = computed(() => `${origin}${cardPath.value}`);
const profileUrl = computed(() => `${origin}/user/${encodeURIComponent(me.value.username)}`);
const markdownSnippet = computed(
    () => `[![${me.value.username}](${cardUrl.value})](${profileUrl.value})`
);
const htmlSnippet = computed(
    () =>
        `<a href="${profileUrl.value}"><img src="${cardUrl.value}" width="${cardWidth.value}" alt="${me.value.username}"></a>`
);
</script>

<style scoped lang="scss">
.privacy-form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-5);
}

.privacy-form__group {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;

    legend {
        margin-bottom: var(--cp-space-2);
        padding: 0;
        font-size: var(--cp-text-sm);
        font-weight: var(--cp-weight-medium);
        color: var(--cp-text);
    }

    :deep(.cp-state) {
        padding: 0;
    }
}

.privacy-form__platforms {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--cp-line);

    > li {
        padding: var(--cp-space-2) 0;
        border-bottom: 1px solid var(--cp-line);
    }
}

.privacy-form__platform {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cp-space-2) var(--cp-space-3);
}

.privacy-form__switches {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--cp-line);
}

.privacy-form__switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cp-space-4);
    padding: var(--cp-space-3) 0;
    border-bottom: 1px solid var(--cp-line);
}

.privacy-form__label {
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text);
}

.privacy-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}

.privacy-card {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-5);
}

.privacy-card__controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, max-content)) minmax(200px, 1fr);
    gap: var(--cp-space-4) var(--cp-space-6);
    align-items: end;
}

.privacy-card__control {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-2);
    min-width: 0;
}

.privacy-card__preview {
    padding: var(--cp-space-5);
    overflow-x: auto;
    background: var(--cp-sunken);
    border: 1px solid var(--cp-line);
    border-radius: var(--cp-radius-sm);

    img {
        max-width: none;
    }
}

@media (max-width: 767px) {
    .privacy-card__controls {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
