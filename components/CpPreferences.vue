<template>
    <div class="cp-prefs" :class="`cp-prefs--${surface}`">
        <div class="cp-prefs__group" role="radiogroup" :aria-label="t('common.preferences.theme')">
            <button
                v-for="option in themeOptions"
                :key="option.value"
                type="button"
                role="radio"
                class="cp-prefs__option"
                :aria-checked="hydrated && theme === option.value"
                :title="option.label"
                @click="setTheme(option.value)"
            >
                <component :is="option.icon" :size="15" :stroke-width="1.75" aria-hidden="true" />
                <span class="cp-sr-only">{{ option.label }}</span>
            </button>
        </div>
        <div
            class="cp-prefs__group"
            role="radiogroup"
            :aria-label="t('common.preferences.language')"
        >
            <button
                v-for="option in languages"
                :key="option.code"
                type="button"
                role="radio"
                class="cp-prefs__option cp-prefs__option--text"
                :aria-checked="language === option.code"
                :lang="option.code"
                :title="option.name"
                @click="setLanguage(option.code)"
            >
                {{ shortName[option.code] }}
                <span class="cp-sr-only">{{ option.name }}</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next';
import type { LocaleCode, ThemePreference } from '~/composables/usePreferences';

withDefaults(defineProps<{ surface?: 'rail' | 'page' }>(), { surface: 'page' });

const { t } = useI18n();
const hydrated = useHydrated();
const { theme, language, languages, setTheme, setLanguage } = usePreferences();

const shortName: Record<LocaleCode, string> = { en: 'EN', zh: '中', ja: '日' };
const themeOptions = computed<Array<{ value: ThemePreference; label: string; icon: unknown }>>(
    () => [
        { value: 'system', label: t('common.preferences.system'), icon: Monitor },
        { value: 'light', label: t('common.preferences.light'), icon: Sun },
        { value: 'dark', label: t('common.preferences.dark'), icon: Moon }
    ]
);
</script>

<style scoped lang="scss">
.cp-prefs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cp-space-2);
}

.cp-prefs__group {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: var(--cp-radius-sm);
}

.cp-prefs__option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 26px;
    padding: 0 var(--cp-space-2);
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-xs);
    font-weight: var(--cp-weight-medium);
    color: var(--fg);
    background: transparent;
    border: 0;
    border-radius: 3px;
    cursor: pointer;
    transition:
        color var(--cp-duration) var(--cp-ease),
        background-color var(--cp-duration) var(--cp-ease);

    &:hover {
        color: var(--fg-strong);
        background: var(--hover);
    }

    &[aria-checked='true'] {
        color: var(--fg-strong);
        background: var(--active);
    }
}

.cp-prefs--rail {
    --fg: var(--cp-rail-muted);
    --fg-strong: var(--cp-rail-fg-strong);
    --hover: var(--cp-rail-hover);
    --active: var(--cp-rail-active);
    --line: var(--cp-rail-line);
}

.cp-prefs--page {
    --fg: var(--cp-text-3);
    --fg-strong: var(--cp-text);
    --hover: var(--cp-sunken);
    --active: var(--cp-accent-soft);
    --line: var(--cp-line-strong);
}
</style>
