import prisma from './prisma';
import { getRedis } from './redis';

const CACHE_PREFIX = 'config:';
const CACHE_TTL = 60; // seconds

const DEFAULTS: Record<string, string> = {
    site_title: 'CP OAuth',
    registration_enabled: 'true',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: 'noreply@example.com',
    turnstile_enabled: 'false',
    turnstile_site_key: '',
    turnstile_secret_key: ''
};

export async function getConfig(key: string): Promise<string> {
    const redis = getRedis();
    try {
        const cached = await redis.get(`${CACHE_PREFIX}${key}`);
        if (cached !== null) return cached;
    } catch {
        /* redis unavailable, fallback to db */
    }

    const row = await prisma.systemConfig.findUnique({ where: { key } });
    const value = row?.value ?? DEFAULTS[key] ?? '';

    try {
        await redis.set(`${CACHE_PREFIX}${key}`, value, 'EX', CACHE_TTL);
    } catch {
        /* redis unavailable, fallback to db */
    }

    return value;
}

export async function setConfig(key: string, value: string): Promise<void> {
    await prisma.systemConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value }
    });

    try {
        await getRedis().set(`${CACHE_PREFIX}${key}`, value, 'EX', CACHE_TTL);
    } catch {
        /* redis unavailable, fallback to db */
    }
}

export async function getAllConfig(): Promise<Record<string, string>> {
    const rows = await prisma.systemConfig.findMany();
    const result = { ...DEFAULTS };
    const redis = getRedis();

    for (const row of rows) {
        result[row.key] = row.value;
        try {
            await redis.set(`${CACHE_PREFIX}${row.key}`, row.value, 'EX', CACHE_TTL);
        } catch {
            /* redis unavailable, fallback to db */
        }
    }

    return result;
}

export async function clearConfigCache(): Promise<void> {
    try {
        const redis = getRedis();
        const keys = await redis.keys(`${CACHE_PREFIX}*`);
        if (keys.length > 0) await redis.del(...keys);
    } catch {
        /* redis unavailable, fallback to db */
    }
}
