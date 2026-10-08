<template>
    <div
        class="preferences"
        :class="{ 'preferences--icons': mode === 'icons' }"
        :aria-busy="pending"
    >
        <template v-if="mode === 'icons'">
            <button
                type="button"
                class="preferences__toggle"
                :aria-label="languageLabel"
                :title="languageLabel"
                :disabled="pending || !hydrationReady"
                @click="changeLanguage(nextLanguage)"
            >
                <Languages :size="22" :stroke-width="1.5" aria-hidden="true" />
            </button>
            <button
                type="button"
                class="preferences__toggle"
                :aria-label="themeLabel"
                :title="themeLabel"
                :disabled="pending || !hydrationReady"
                @click="changeTheme(nextTheme)"
            >
                <component
                    :is="nextTheme === 'dark' ? Moon : Sun"
                    :size="22"
                    :stroke-width="1.5"
                    aria-hidden="true"
                />
            </button>
        </template>
        <template v-else>
            <label class="preferences__field">
                <span>{{ $t('settings.theme.label') }}</span>
                <el-select
                    :model-value="colorMode.preference"
                    :aria-label="$t('settings.theme.label')"
                    :disabled="pending"
                    @change="changeTheme"
                >
                    <el-option
                        v-for="theme in themes"
                        :key="theme"
                        :label="$t(`settings.theme.${theme}`)"
                        :value="theme"
                    />
                </el-select>
            </label>
            <label class="preferences__field">
                <span>{{ $t('settings.language.label') }}</span>
                <el-select
                    :model-value="locale"
                    :aria-label="$t('settings.language.label')"
                    :disabled="pending"
                    @change="changeLanguage"
                >
                    <el-option
                        v-for="language in languages"
                        :key="language"
                        :label="$t(`settings.language.${language}`)"
                        :value="language"
                    />
                </el-select>
            </label>
        </template>
        <p v-if="error" role="alert" class="preferences__error">{{ error }}</p>
    </div>
</template>

<script setup lang="ts">
import { Languages, Moon, Sun } from 'lucide-vue-next';
import type { MeResponse } from '~/types/api';

withDefaults(defineProps<{ mode?: 'fields' | 'icons' }>(), { mode: 'fields' });
const themes = ['system', 'light', 'dark'] as const;
const languages = ['en', 'zh', 'ja'] as const;
const { locale, setLocale, t } = useI18n();
const colorMode = useColorMode();
const hydrationReady = useHydrationReady();
const auth = useAuth();
const api = useApi();
const pending = ref(false);
const error = ref('');
const nextLanguage = computed(
    () =>
        languages[(languages.findIndex(language => language === locale.value) + 1) % languages.length] ??
        languages[0]
);
const nextTheme = computed(() =>
    !hydrationReady.value || colorMode.value === 'dark' ? 'light' : 'dark'
);
const languageLabel = computed(() =>
    t('settings.language.switch_to', { language: t(`settings.language.${nextLanguage.value}`) })
);
const themeLabel = computed(() =>
    t('settings.theme.switch_to', { theme: t(`settings.theme.${nextTheme.value}`) })
);

async function changeTheme(value: string) {
    if (pending.value || (value !== 'system' && value !== 'light' && value !== 'dark')) return;
    const previous = colorMode.preference;
    colorMode.preference = value;
    error.value = '';
    if (!auth.user.value) return;
    pending.value = true;
    try {
        auth.user.value = await api<MeResponse>('/api/auth/me', {
            method: 'PATCH',
            body: { theme: value }
        });
    } catch {
        colorMode.preference = previous;
        error.value = t('identity.network_error');
    } finally {
        pending.value = false;
    }
}

async function changeLanguage(value: string) {
    if (pending.value || (value !== 'en' && value !== 'zh' && value !== 'ja')) return;
    const previous = locale.value;
    pending.value = true;
    error.value = '';
    try {
        await setLocale(value);
        if (auth.user.value)
            auth.user.value = await api<MeResponse>('/api/auth/me', {
                method: 'PATCH',
                body: { locale: value }
            });
    } catch {
        await setLocale(previous);
        error.value = t('identity.network_error');
    } finally {
        pending.value = false;
    }
}
</script>

<style scoped lang="scss">
.preferences {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
}
.preferences--icons {
    gap: 0 var(--space-1);
    justify-content: flex-end;
    max-width: 100%;
}
.preferences__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: var(--card-radius);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
}
.preferences__toggle:hover:not(:disabled) {
    color: var(--accent);
}
.preferences__toggle:disabled {
    cursor: wait;
    opacity: 0.6;
}
.preferences__field {
    display: grid;
    gap: var(--space-1);
    font-size: var(--font-size-control);
    color: var(--text-secondary);
    min-width: 132px;
}
.preferences__field :deep(.el-select) {
    width: 144px;
}
.preferences__error {
    flex-basis: 100%;
    color: var(--text-primary);
    font-size: var(--font-size-control);
    overflow-wrap: anywhere;
}
</style>
