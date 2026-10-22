/** Display text for OAuth scopes; keys swap `:` for `_` to stay plain i18n paths. */
export function useScopeText() {
    const { t, te } = useI18n();
    const key = (scope: string) => `common.scopes.${scope.replace(':', '_')}`;
    return {
        title: (scope: string) => (te(`${key(scope)}.title`) ? t(`${key(scope)}.title`) : scope),
        detail: (scope: string) => (te(`${key(scope)}.detail`) ? t(`${key(scope)}.detail`) : '')
    };
}
