/** Pages that need a signed-in user send guests to sign-in with a return target. */
export default defineNuxtRouteMiddleware(to => {
    const { user, unavailable } = useSession();
    if (user.value) return;
    if (unavailable.value) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Authentication is temporarily unavailable'
        });
    }
    return navigateTo(buildLoginPath(to.fullPath));
});
