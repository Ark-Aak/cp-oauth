<template>
    <div class="preferences" :aria-busy="pending">
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
        <p v-if="error" role="alert" class="preferences__error">{{ error }}</p>
    </div>
</template>

<script setup lang="ts">
import type { MeResponse } from '~/types/api';
const themes = ['system', 'light', 'dark'] as const;
const languages = ['en', 'zh', 'ja'] as const;
const { locale, setLocale, t } = useI18n();
const colorMode = useColorMode();
const auth = useAuth();
const api = useApi();
const pending = ref(false);
const error = ref('');

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
}
</style>
