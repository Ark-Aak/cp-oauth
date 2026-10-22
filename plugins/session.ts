/** Loads the visitor's session and the public site configuration once per request. */
export default defineNuxtPlugin({
    name: 'cp-session',
    dependsOn: ['i18n:plugin'],
    async setup() {
        if (!import.meta.server) return;
        const session = useSession();
        const config = usePublicConfig();
        await Promise.all([session.refresh(), config.refresh()]);
    }
});
