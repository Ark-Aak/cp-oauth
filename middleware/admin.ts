/** Administration pages: guests sign in first; signed-in non-admins get a 403 page. */
export default defineNuxtRouteMiddleware(to => {
    const { user, unavailable } = useSession();
    if (!user.value) {
        if (unavailable.value) {
            throw createError({
                statusCode: 503,
                statusMessage: 'Authentication is temporarily unavailable'
            });
        }
        return navigateTo(buildLoginPath(to.fullPath));
    }
    if (user.value.role !== 'admin') {
        throw createError({ statusCode: 403, statusMessage: 'Admin access required' });
    }
});
