import type { MeResponse } from '~/types/api';

export type ThemePreference = MeResponse['theme'];
export type LocaleCode = MeResponse['locale'];

/**
 * Theme and language controls. Guests keep local preferences; a signed-in user's saved
 * values win after hydration and every change is written back to the account.
 * Uses `$i18n` so it also works inside plugins.
 */
export function usePreferences() {
    const colorMode = useColorMode();
    const { $i18n } = useNuxtApp();
    const { user, setUser } = useSession();
    const api = useApi();

    const theme = computed<ThemePreference>(() => colorMode.preference as ThemePreference);
    const language = computed<LocaleCode>(() => $i18n.locale.value as LocaleCode);
    const languages = computed(() =>
        $i18n.locales.value.map(item => ({
            code: item.code as LocaleCode,
            name: item.name ?? item.code
        }))
    );

    async function persist(patch: Partial<Pick<MeResponse, 'theme' | 'locale'>>) {
        try {
            setUser(await api<MeResponse>('/api/auth/me', { method: 'PATCH', body: patch }));
        } catch {
            // The local choice still applies; the account keeps its previous value.
        }
    }

    async function setTheme(value: ThemePreference) {
        colorMode.preference = value;
        if (user.value && user.value.theme !== value) await persist({ theme: value });
    }

    async function setLanguage(value: LocaleCode) {
        await $i18n.setLocale(value);
        if (user.value && user.value.locale !== value) await persist({ locale: value });
    }

    /** Applies the account's saved values; runs after hydration and after sign-in. */
    async function applyAccount() {
        if (!user.value) return;
        if (colorMode.preference !== user.value.theme) colorMode.preference = user.value.theme;
        if ($i18n.locale.value !== user.value.locale) await $i18n.setLocale(user.value.locale);
    }

    return { theme, language, languages, setTheme, setLanguage, applyAccount };
}
