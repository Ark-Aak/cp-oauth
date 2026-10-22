export interface ApiErrorInfo {
    /** HTTP status; 0 when the request never reached the server. */
    status: number;
    /** Machine code from `data.code` (H3) or `error` (OAuth protocol). */
    code: string | null;
    /** Server message: H3 `statusMessage` or OAuth `error_description`. */
    message: string;
    /** Field path → first validation message. */
    fields: Record<string, string>;
    /** Remaining `data` payload, for example `redirect`, `retryAfter`, `reason`. */
    data: Record<string, unknown>;
    /** Seconds until a retry is allowed, from `data.retryAfter` or `Retry-After`. */
    retryAfter: number | null;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/** Normalizes ofetch / H3 / OAuth error shapes into one structure. */
export function readApiError(error: unknown): ApiErrorInfo {
    const source = asRecord(error);
    const body = asRecord(source.data);
    const data = asRecord(body.data);
    const response = source.response as Response | undefined;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(asRecord(data.fields))) {
        if (typeof value === 'string') fields[key] = value;
    }
    const status = Number(
        source.statusCode ?? source.status ?? response?.status ?? body.statusCode
    );
    const dataRetry = Number(data.retryAfter);
    const headerRetry = Number(response?.headers?.get?.('retry-after'));
    return {
        status: Number.isFinite(status) ? status : 0,
        code: text(data.code) || text(body.error) || null,
        message:
            text(body.error_description) ||
            text(body.message) ||
            text(body.statusMessage) ||
            text(source.statusMessage) ||
            '',
        fields,
        data,
        retryAfter:
            Number.isFinite(dataRetry) && dataRetry > 0
                ? dataRetry
                : Number.isFinite(headerRetry) && headerRetry > 0
                  ? headerRetry
                  : null
    };
}
