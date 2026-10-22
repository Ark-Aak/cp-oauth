/** Saved account theme and language override local choices once the app is interactive. */
export default defineNuxtPlugin({
    name: 'cp-preferences',
    dependsOn: ['cp-session'],
    setup(nuxtApp) {
        nuxtApp.hook('app:suspense:resolve', () => {
            void usePreferences().applyAccount();
        });
    }
});
