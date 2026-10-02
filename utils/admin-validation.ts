import { z } from 'zod';
import { httpUrlSchema } from './validation';

const utf8 = new TextEncoder();

export const adminUsersQuerySchema = z
    .object({
        page: z
            .string()
            .regex(/^\d+$/, 'Page must be an integer from 1 to 1000000')
            .transform(Number)
            .pipe(z.number().int().min(1).max(1_000_000))
            .default(1),
        search: z.string().max(100).default('')
    })
    .strict();

export const adminUserPatchSchema = z
    .object({
        role: z.enum(['user', 'admin']).optional(),
        emailVerified: z.boolean().optional()
    })
    .strict()
    .refine(value => Object.keys(value).length > 0, 'No user changes supplied');

export const noticeCreateSchema = z
    .object({
        title: z.string().trim().min(1).max(120),
        content: z
            .string()
            .refine(value => utf8.encode(value).length <= 64 * 1024, 'Content exceeds 64 KiB')
            .transform(value => value.trim())
            .pipe(z.string().min(1)),
        pinned: z.boolean().default(false)
    })
    .strict();

export const showcaseCreateSchema = z
    .object({
        category: z.enum(['site', 'project']),
        name: z.string().trim().min(1).max(120),
        description: z
            .string()
            .max(2000)
            .transform(value => value.trim())
            .default(''),
        url: z.string().trim().pipe(httpUrlSchema),
        iconUrl: z
            .union([
                z
                    .string()
                    .trim()
                    .pipe(z.union([httpUrlSchema, z.literal('')])),
                z.null()
            ])
            .transform(value => value || null)
            .default(null),
        sortOrder: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(0)
    })
    .strict();
