export function adminRequestError(
    error: unknown,
    fallback: string,
    permissionDenied: string
): { message: string; fields: Record<string, string> } {
    const err = error as {
        response?: { status?: number };
        statusCode?: number;
        data?: { message?: string; data?: { fields?: Record<string, string> } };
    } | null;
    const status = err?.response?.status ?? err?.statusCode;
    return {
        message: status === 403 ? permissionDenied : err?.data?.message || fallback,
        fields: err?.data?.data?.fields || {}
    };
}
