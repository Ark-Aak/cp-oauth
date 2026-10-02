import type { Prisma } from '@prisma/client';
import { createError } from 'h3';
import { z } from 'zod';
import type {
    AdminConfigPatch,
    AdminConfigResponse,
    ConfigKey,
    PublicConfigKey,
    SecretConfigKey
} from '~/types/config';
import prisma from './prisma';
import { getDataEncryptionKey } from './data-encryption';
import { decryptSecret, encryptSecret } from './secrets';
import { parseInput } from './validation';

export type { ConfigKey, PublicConfigKey, SecretConfigKey } from '~/types/config';

const stringSchema = z.string().max(2048);
const booleanSchema = z.enum(['true', 'false']);

function integerSchema(min: number, max: number) {
    return z
        .string()
        .regex(/^\d+$/, 'Must be an integer')
        .refine(
            value =>
                Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max,
            `Must be between ${min} and ${max}`
        )
        .transform(value => String(Number(value)));
}

interface ConfigSetting {
    default: string;
    schema: z.ZodType<string>;
    secret: boolean;
}

export const CONFIG_REGISTRY = {
    site_title: { default: 'CP OAuth', schema: stringSchema, secret: false },
    registration_enabled: { default: 'true', schema: booleanSchema, secret: false },
    home_recent_users_count: { default: '6', schema: integerSchema(1, 20), secret: false },
    smtp_host: { default: '', schema: stringSchema, secret: false },
    smtp_port: { default: '587', schema: integerSchema(1, 65535), secret: false },
    smtp_user: { default: '', schema: stringSchema, secret: false },
    smtp_pass: { default: '', schema: stringSchema, secret: true },
    smtp_from: { default: 'noreply@example.com', schema: stringSchema, secret: false },
    turnstile_enabled: { default: 'false', schema: booleanSchema, secret: false },
    turnstile_site_key: { default: '', schema: stringSchema, secret: false },
    turnstile_secret_key: { default: '', schema: stringSchema, secret: true },
    codeforces_client_id: { default: '', schema: stringSchema, secret: false },
    codeforces_client_secret: { default: '', schema: stringSchema, secret: true },
    github_client_id: { default: '', schema: stringSchema, secret: false },
    github_client_secret: { default: '', schema: stringSchema, secret: true },
    google_client_id: { default: '', schema: stringSchema, secret: false },
    google_client_secret: { default: '', schema: stringSchema, secret: true },
    clist_client_id: { default: '', schema: stringSchema, secret: false },
    clist_client_secret: { default: '', schema: stringSchema, secret: true },
    username_refresh_cooldown: { default: '1440', schema: integerSchema(1, 43200), secret: false }
} as const satisfies Record<ConfigKey, ConfigSetting>;

export const CONFIG_KEYS = Object.keys(CONFIG_REGISTRY) as ConfigKey[];
export const PUBLIC_CONFIG_KEYS = CONFIG_KEYS.filter(
    key => !CONFIG_REGISTRY[key].secret
) as PublicConfigKey[];
export const SECRET_CONFIG_KEYS = CONFIG_KEYS.filter(
    key => CONFIG_REGISTRY[key].secret
) as SecretConfigKey[];

const publicShape: Record<string, z.ZodType<string>> = Object.fromEntries(
    PUBLIC_CONFIG_KEYS.map(key => [key, CONFIG_REGISTRY[key].schema])
);
const secretShape: Record<string, z.ZodType<string>> = Object.fromEntries(
    SECRET_CONFIG_KEYS.map(key => [key, CONFIG_REGISTRY[key].schema])
);

export const configPatchSchema = z
    .strictObject({
        values: z.strictObject(publicShape).partial().optional(),
        secrets: z.strictObject(secretShape).partial().optional(),
        clearSecrets: z.array(z.enum(SECRET_CONFIG_KEYS)).optional()
    })
    .superRefine((patch, ctx) => {
        for (const key of patch.clearSecrets ?? []) {
            if (Object.hasOwn(patch.secrets ?? {}, key)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['clearSecrets'],
                    message: `Cannot set and clear ${key} in the same request`
                });
            }
        }
    });

async function readConfig<K extends ConfigKey>(
    keys: readonly K[],
    db: Pick<Prisma.TransactionClient, 'systemConfig'>
): Promise<Record<K, string>> {
    parseInput(z.array(z.enum(CONFIG_KEYS)), keys);
    const uniqueKeys = [...new Set(keys)];
    const values = Object.fromEntries(
        uniqueKeys.map(key => [key, CONFIG_REGISTRY[key].default])
    ) as Record<K, string>;
    if (!uniqueKeys.length) return values;

    const rows = await db.systemConfig.findMany({
        where: { key: { in: uniqueKeys } },
        select: { key: true, value: true }
    });
    let encryptionKey: Uint8Array | undefined;
    for (const row of rows) {
        if (!uniqueKeys.includes(row.key as K)) continue;
        const key = row.key as K;
        let value = row.value;
        if (CONFIG_REGISTRY[key].secret && value) {
            encryptionKey ??= getDataEncryptionKey();
            try {
                value = decryptSecret(value, `SystemConfig:${key}`, encryptionKey);
            } catch {
                throw createError({
                    statusCode: 503,
                    message: 'Configuration secrets are unavailable'
                });
            }
        }
        const parsed = CONFIG_REGISTRY[key].schema.safeParse(value);
        if (!parsed.success) {
            throw createError({ statusCode: 503, message: 'Configuration is unavailable' });
        }
        values[key] = parsed.data;
    }
    return values;
}

export async function getConfig<K extends ConfigKey>(
    keys: readonly K[]
): Promise<Record<K, string>> {
    return readConfig(keys, prisma);
}

function adminConfigResponse(values: Record<ConfigKey, string>): AdminConfigResponse {
    return {
        values: Object.fromEntries(PUBLIC_CONFIG_KEYS.map(key => [key, values[key]])) as Record<
            PublicConfigKey,
            string
        >,
        secrets: Object.fromEntries(
            SECRET_CONFIG_KEYS.map(key => [key, { configured: values[key].length > 0 }])
        ) as AdminConfigResponse['secrets']
    };
}

export async function getAdminConfig(): Promise<AdminConfigResponse> {
    return adminConfigResponse(await getConfig(CONFIG_KEYS));
}

export async function updateConfig(
    actorId: string,
    input: AdminConfigPatch
): Promise<AdminConfigResponse> {
    const patch = parseInput(configPatchSchema, input);
    return prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260517::integer, 1::integer)`;
        const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
        if (!actor || actor.role !== 'admin') {
            throw createError({ statusCode: 403, message: 'Admin access required' });
        }

        const values = await readConfig(CONFIG_KEYS, tx);
        const changes = new Map<ConfigKey, string>();
        for (const key of PUBLIC_CONFIG_KEYS) {
            const value = patch.values?.[key];
            if (value !== undefined) changes.set(key, value);
        }
        for (const key of SECRET_CONFIG_KEYS) {
            const value = patch.secrets?.[key];
            if (value) changes.set(key, value);
        }
        for (const key of patch.clearSecrets ?? []) changes.set(key, '');
        for (const [key, value] of changes) values[key] = value;

        if (
            values.turnstile_enabled === 'true' &&
            (!values.turnstile_site_key.trim() || !values.turnstile_secret_key.trim())
        ) {
            throw createError({
                statusCode: 400,
                message: 'Turnstile requires both site and secret keys',
                data: {
                    code: 'VALIDATION_ERROR',
                    fields: {
                        'values.turnstile_enabled':
                            'Configure both Turnstile keys before enabling it'
                    }
                }
            });
        }

        let encryptionKey: Uint8Array | undefined;
        for (const [key, plaintext] of changes) {
            let value = plaintext;
            if (CONFIG_REGISTRY[key].secret && value) {
                encryptionKey ??= getDataEncryptionKey();
                value = encryptSecret(value, `SystemConfig:${key}`, encryptionKey);
            }
            await tx.systemConfig.upsert({
                where: { key },
                update: { value },
                create: { key, value }
            });
        }
        return adminConfigResponse(values);
    });
}

export async function requireRegistrationEnabled(tx?: Prisma.TransactionClient): Promise<void> {
    const { registration_enabled } = await readConfig(['registration_enabled'], tx ?? prisma);
    if (registration_enabled !== 'true') {
        throw createError({ statusCode: 403, message: 'Registration is currently disabled' });
    }
}
