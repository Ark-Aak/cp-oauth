import { createError, getQuery, readBody, type H3Event } from 'h3';
import type { z } from 'zod';

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
    const result = schema.safeParse(input);
    if (!result.success) {
        const fields: Record<string, string> = {};
        for (const issue of result.error.issues) {
            const field = issue.path.join('.') || '_form';
            fields[field] ??= issue.message;
        }
        throw createError({
            statusCode: 400,
            message: 'Invalid request',
            data: { code: 'VALIDATION_ERROR', fields }
        });
    }
    return result.data;
}

export async function parseBody<T extends z.ZodType>(
    event: H3Event,
    schema: T
): Promise<z.output<T>> {
    let input: unknown;
    try {
        input = await readBody(event);
    } catch {
        throw createError({
            statusCode: 400,
            message: 'Invalid request body',
            data: { code: 'VALIDATION_ERROR', fields: { _form: 'Invalid request body' } }
        });
    }
    return parseInput(schema, input);
}

export function parseQuery<T extends z.ZodType>(event: H3Event, schema: T): z.output<T> {
    return parseInput(schema, getQuery(event));
}
