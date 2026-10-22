/** Translates API failures into one user-facing sentence. */
export function useApiError() {
    const { t, te } = useI18n();

    function describe(error: unknown, fallbackKey = 'common.errors.generic'): string {
        const info = readApiError(error);
        if (info.code === 'VALIDATION_ERROR') {
            const detail = Object.values(info.fields)[0] ?? info.message;
            return t('common.errors.VALIDATION_ERROR', { detail });
        }
        if (info.code && te(`common.errors.${info.code}`)) {
            return t(`common.errors.${info.code}`, { seconds: info.retryAfter ?? 60 });
        }
        if (info.code && /^[a-z_]+$/.test(info.code) && info.message) {
            // OAuth protocol errors (`invalid_client`, `invalid_scope`, …) carry their own description.
            return info.message;
        }
        if (info.status === 0) return t('common.errors.network');
        if (info.status === 401) return t('common.errors.unauthenticated');
        if (info.status === 503) return info.message || t('common.errors.unavailable');
        return info.message || t(fallbackKey);
    }

    return { describe, read: readApiError };
}
