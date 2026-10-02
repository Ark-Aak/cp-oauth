import { z } from 'zod';
import { PLATFORM_NAMES } from './platforms';
import { USERNAME_REGEX, USERNAME_RULE_MESSAGE } from './username';
import { hasC0ControlCharacters } from './control-characters';

const utf8 = new TextEncoder();
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const usernameSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_REGEX, USERNAME_RULE_MESSAGE);
export const newPasswordSchema = z
    .string()
    .min(8)
    .refine(value => utf8.encode(value).length <= 72, 'Password exceeds 72 UTF-8 bytes');
export const platformSchema = z.enum(
    PLATFORM_NAMES as [(typeof PLATFORM_NAMES)[number], ...(typeof PLATFORM_NAMES)[number][]]
);
export const httpUrlSchema = z
    .string()
    .max(2048)
    .refine(value => {
        try {
            const url = new URL(value);
            return (
                ['http:', 'https:'].includes(url.protocol) &&
                !url.username &&
                !url.password &&
                !value.includes('\\') &&
                !hasC0ControlCharacters(value)
            );
        } catch {
            return false;
        }
    }, 'Use an absolute HTTP or HTTPS URL');
export const themeSchema = z.enum(['system', 'light', 'dark']);
export const localeSchema = z.enum(['en', 'zh', 'ja']);
export const profilePatchSchema = z
    .object({
        username: usernameSchema.optional(),
        displayName: z.string().max(80).nullable().optional(),
        bio: z.string().max(500).nullable().optional(),
        homepage: z
            .string()
            .refine(value => utf8.encode(value).length <= 16 * 1024, 'Homepage exceeds 16 KiB')
            .nullable()
            .optional(),
        avatarUrl: z
            .union([httpUrlSchema, z.literal(''), z.null()])
            .transform(value => value || null)
            .optional(),
        email: emailSchema.optional(),
        theme: themeSchema.optional(),
        locale: localeSchema.optional(),
        publicLinkedPlatforms: z
            .array(platformSchema)
            .max(7)
            .transform(value => [...new Set(value)])
            .optional(),
        publicCpStats: z.boolean().optional(),
        publicRatingHistory: z.boolean().optional(),
        reauthToken: z.string().min(1).max(256).optional(),
        redirect: z.string().max(4096).optional()
    })
    .strict()
    .refine(
        value => Object.keys(value).some(key => !['redirect', 'reauthToken'].includes(key)),
        'No profile changes supplied'
    );

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
