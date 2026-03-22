<template>
    <div v-loading="pending" class="profile">
        <h1 class="profile__title">{{ $t('profile.title') }}</h1>
        <template v-if="!pending">
            <!-- Avatar preview -->
            <div class="profile__avatar-section">
                <div class="profile__avatar-wrapper">
                    <el-avatar :size="80" :src="form.avatarUrl || undefined">
                        {{ (form.displayName || form.username || '?').charAt(0).toUpperCase() }}
                    </el-avatar>
                </div>
                <div class="profile__avatar-info">
                    <span v-if="form.displayName" class="profile__avatar-name">{{
                        form.displayName
                    }}</span>
                    <span v-if="form.username" class="profile__avatar-username"
                        >@{{ form.username }}</span
                    >
                    <NuxtLink v-if="form.username" :to="`/user/${form.username}`">
                        <el-button text size="small">{{ $t('profile.view_public') }}</el-button>
                    </NuxtLink>
                </div>
            </div>

            <el-form
                ref="formRef"
                :model="form"
                label-position="top"
                class="profile__form"
                @submit.prevent="handleSave"
            >
                <el-form-item :label="$t('profile.avatar_url')">
                    <el-input
                        v-model="form.avatarUrl"
                        type="url"
                        :placeholder="$t('profile.avatar_url_hint')"
                    />
                </el-form-item>
                <el-form-item :label="$t('profile.display_name')">
                    <el-input v-model="form.displayName" />
                </el-form-item>
                <el-form-item :label="$t('profile.bio')">
                    <el-input v-model="form.bio" type="textarea" :rows="3" />
                </el-form-item>
                <el-form-item>
                    <template #label>
                        {{ $t('profile.homepage') }}
                        <span class="profile__hint">{{ $t('profile.homepage_hint') }}</span>
                    </template>
                    <el-input
                        v-model="form.homepage"
                        type="textarea"
                        :rows="10"
                        class="profile__editor"
                    />
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" native-type="submit" :loading="saving">
                        {{ saving ? $t('profile.saving') : $t('profile.save') }}
                    </el-button>
                </el-form-item>
            </el-form>

            <!-- Settings section -->
            <el-divider />
            <h2 class="profile__section-title">{{ $t('settings.title') }}</h2>

            <div class="profile__setting-row">
                <label class="profile__setting-label">{{ $t('settings.theme.label') }}</label>
                <el-radio-group v-model="selectedTheme" @change="setTheme">
                    <el-radio-button
                        v-for="opt in themeOptions"
                        :key="opt.value"
                        :value="opt.value"
                    >
                        {{ opt.label }}
                    </el-radio-button>
                </el-radio-group>
            </div>

            <div class="profile__setting-row">
                <label class="profile__setting-label">{{ $t('settings.language.label') }}</label>
                <el-radio-group :model-value="locale" @change="changeLocale">
                    <el-radio-button
                        v-for="loc in localeOptions"
                        :key="loc.code"
                        :value="loc.code"
                        :disabled="loc.disabled"
                    >
                        {{ loc.label }}
                    </el-radio-button>
                </el-radio-group>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';

type LocaleCode = 'en' | 'zh' | 'ja';
const localeCodes: LocaleCode[] = ['en', 'zh', 'ja'];

function isLocaleCode(value: string): value is LocaleCode {
    return localeCodes.includes(value as LocaleCode);
}

interface ProfileData {
    displayName?: string;
    username?: string;
    bio?: string;
    homepage?: string;
    avatarUrl?: string;
    theme?: string;
    locale?: string;
}

const { locale, setLocale, t } = useI18n();
const colorMode = useColorMode();
const token = useCookie('auth_token');
const saving = ref(false);

const { data: userData, pending } = await useFetch<ProfileData>('/api/auth/me', {
    headers: { Authorization: `Bearer ${token.value}` },
    onResponseError() {
        navigateTo('/login');
    }
});

const d = userData.value;
const form = reactive({
    displayName: d?.displayName || '',
    username: d?.username || '',
    bio: d?.bio || '',
    homepage: d?.homepage || '',
    avatarUrl: d?.avatarUrl || ''
});
const selectedTheme = ref(d?.theme || 'system');
colorMode.preference = selectedTheme.value;
if (d?.locale && isLocaleCode(d.locale) && d.locale !== locale.value) {
    setLocale(d.locale);
}

async function handleSave() {
    saving.value = true;
    try {
        await $fetch('/api/auth/me', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: {
                displayName: form.displayName,
                bio: form.bio,
                homepage: form.homepage,
                avatarUrl: form.avatarUrl
            }
        });
        ElMessage.success(t('profile.updated'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('profile.update_error'));
    } finally {
        saving.value = false;
    }
}

async function setTheme(value: string | number | boolean | undefined) {
    if (value === undefined) return;
    const v = String(value);
    selectedTheme.value = v;
    colorMode.preference = v;
    try {
        await $fetch('/api/auth/me', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { theme: v }
        });
    } catch {
        // silent
    }
}

async function changeLocale(code: string | number | boolean | undefined) {
    if (code === undefined) return;
    const c = String(code);
    if (!isLocaleCode(c)) return;
    setLocale(c);
    try {
        await $fetch('/api/auth/me', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { locale: c }
        });
    } catch {
        // silent
    }
}

const themeOptions = computed(() => [
    { value: 'system', label: t('settings.theme.system') },
    { value: 'light', label: t('settings.theme.light') },
    { value: 'dark', label: t('settings.theme.dark') }
]);

const localeOptions = computed(() => [
    { code: 'en', label: t('settings.language.en'), disabled: false },
    { code: 'zh', label: t('settings.language.zh'), disabled: false },
    { code: 'ja', label: t('settings.language.ja'), disabled: false }
]);
</script>

<style scoped lang="scss">
.profile {
    max-width: 600px;

    &__title {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 24px;
        color: var(--text-primary);
    }

    &__avatar-section {
        display: flex;
        align-items: center;
        gap: 20px;
        margin-bottom: 28px;
        padding: 20px;
        background: var(--bg-secondary);
        border-radius: 12px;
        border: 1px solid var(--border-color);
    }

    &__avatar-wrapper {
        flex-shrink: 0;

        :deep(.el-avatar) {
            border: 3px solid var(--border-color);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            font-size: 32px;
        }
    }

    &__avatar-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    &__avatar-name {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
        line-height: 1.3;
    }

    &__avatar-username {
        font-size: 13px;
        color: var(--text-muted);
        line-height: 1.3;
    }

    &__form {
        max-width: 100%;
    }

    &__hint {
        font-weight: 400;
        color: var(--text-muted);
        font-size: 12px;
        margin-left: 6px;
    }

    &__editor {
        :deep(.el-textarea__inner) {
            font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 13px;
            line-height: 1.6;
        }
    }

    &__section-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 20px;
    }

    &__setting-row {
        margin-bottom: 20px;
    }

    &__setting-label {
        display: block;
        font-size: 13px;
        color: var(--text-secondary);
        font-weight: 500;
        margin-bottom: 10px;
    }
}
</style>
