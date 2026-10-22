/** Sign-in and registration screens send an already signed-in user to the return target. */
export default defineNuxtRouteMiddleware(to => {
    const { user } = useSession();
    if (!user.value) return;
    return navigateTo(getSafeRedirectTarget(to.query.redirect as string | undefined, '/profile'));
});
