import { buildLoginPath } from '~/utils/auth-redirect';

export default defineNuxtRouteMiddleware(async to => {
    const auth = useAuth();
    const i18n = useNuxtApp().$i18n;
    try {
        await auth.load();
    } catch (cause) {
        const failure = cause as { statusCode?: number; status?: number };
        const statusCode = (failure.statusCode ?? failure.status) === 403 ? 403 : 503;
        return abortNavigation(
            createError({
                statusCode,
                statusMessage: i18n.t(
                    statusCode === 403
                        ? 'identity.permission_denied'
                        : 'identity.identity_unavailable'
                )
            })
        );
    }
    if (auth.status.value === 'anonymous') return navigateTo(buildLoginPath(to.fullPath));
});
