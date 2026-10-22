/** Locale-aware display formats (design.md §6). */
export function useFormat() {
    const { locale } = useI18n();
    const tag = computed(() =>
        locale.value === 'zh' ? 'zh-CN' : locale.value === 'ja' ? 'ja-JP' : 'en-US'
    );

    function toDate(value: string | number | Date | null | undefined): Date | null {
        if (value === null || value === undefined || value === '') return null;
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function date(value: string | number | Date | null | undefined): string {
        const parsed = toDate(value);
        return parsed
            ? new Intl.DateTimeFormat(tag.value, { dateStyle: 'medium' }).format(parsed)
            : '';
    }

    function dateTime(value: string | number | Date | null | undefined): string {
        const parsed = toDate(value);
        return parsed
            ? new Intl.DateTimeFormat(tag.value, {
                  dateStyle: 'medium',
                  timeStyle: 'short'
              }).format(parsed)
            : '';
    }

    function number(value: number | null | undefined): string {
        return typeof value === 'number' && Number.isFinite(value)
            ? new Intl.NumberFormat(tag.value).format(value)
            : '—';
    }

    /** Explicit sign with a true minus sign, for rating deltas. */
    function signed(value: number | null | undefined): string {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
        const formatted = new Intl.NumberFormat(tag.value).format(Math.abs(value));
        return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
    }

    return { tag, date, dateTime, number, signed };
}
