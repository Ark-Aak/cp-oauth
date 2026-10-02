type DateInput = string | number | Date | null | undefined;

interface FormatCSTOptions {
    dateOnly?: boolean;
    withSeconds?: boolean;
    withTimezone?: boolean;
}

const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

function toDate(input: DateInput): Date | null {
    if (input === null || input === undefined || input === '') {
        return null;
    }

    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

function getCSTParts(date: Date) {
    // Shift to UTC+8, then read parts in UTC for deterministic output.
    const shifted = new Date(date.getTime() + CST_OFFSET_MS);

    return {
        year: shifted.getUTCFullYear(),
        month: pad2(shifted.getUTCMonth() + 1),
        day: pad2(shifted.getUTCDate()),
        hour: pad2(shifted.getUTCHours()),
        minute: pad2(shifted.getUTCMinutes()),
        second: pad2(shifted.getUTCSeconds())
    };
}

export function formatCSTTime(input: DateInput, options: FormatCSTOptions = {}): string {
    const date = toDate(input);
    if (!date) {
        return input ? String(input) : '';
    }

    const { year, month, day, hour, minute, second } = getCSTParts(date);
    const dateText = `${year}-${month}-${day}`;
    const timezoneSuffix = options.withTimezone ? ' UTC+08:00' : '';

    if (options.dateOnly) {
        return `${dateText}${timezoneSuffix}`;
    }

    const timeText = options.withSeconds ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
    return `${dateText} ${timeText}${timezoneSuffix}`;
}
