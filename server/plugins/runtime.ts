import { normalizeSiteOrigin } from '~/server/utils/base-url';
import { verifyDataKeyCanary } from '~/server/utils/data-encryption';
import { getRedis } from '~/server/utils/redis';
import prisma from '~/server/utils/prisma';

export default defineNitroPlugin(nitroApp => {
    const config = useRuntimeConfig();
    const jwtSecret: unknown = config.jwtSecret;
    if (
        typeof jwtSecret !== 'string' ||
        !jwtSecret.trim() ||
        jwtSecret === 'dev-secret-change-in-production' ||
        Buffer.byteLength(jwtSecret, 'utf8') < 32
    ) {
        throw new Error('NUXT_JWT_SECRET must be a non-default secret of at least 32 UTF-8 bytes');
    }

    const encodedKey: unknown = config.dataEncryptionKey;
    if (typeof encodedKey !== 'string' || !/^[A-Za-z0-9+/]{43}=?$/.test(encodedKey)) {
        throw new Error('NUXT_DATA_ENCRYPTION_KEY must be base64 encoding of exactly 32 bytes');
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (
        key.length !== 32 ||
        key.toString('base64').replace(/=+$/, '') !== encodedKey.replace(/=+$/, '')
    ) {
        throw new Error('NUXT_DATA_ENCRYPTION_KEY must be base64 encoding of exactly 32 bytes');
    }

    const redisUrl: unknown = config.redisUrl;
    let parsedRedisUrl: URL;
    try {
        if (typeof redisUrl !== 'string' || !redisUrl || /[\s\\]/.test(redisUrl)) {
            throw new Error();
        }
        parsedRedisUrl = new URL(redisUrl);
    } catch {
        throw new Error('NUXT_REDIS_URL must be a valid redis:// or rediss:// URL');
    }
    if (
        !['redis:', 'rediss:'].includes(parsedRedisUrl.protocol) ||
        !parsedRedisUrl.hostname ||
        parsedRedisUrl.hash ||
        (parsedRedisUrl.pathname !== '' &&
            parsedRedisUrl.pathname !== '/' &&
            !/^\/\d+$/.test(parsedRedisUrl.pathname))
    ) {
        throw new Error('NUXT_REDIS_URL must be a valid redis:// or rediss:// URL');
    }

    const trustProxy: unknown = config.trustProxy;
    if (
        trustProxy !== '' &&
        trustProxy !== 'true' &&
        trustProxy !== 'false' &&
        trustProxy !== true &&
        trustProxy !== false
    ) {
        throw new Error('NUXT_TRUST_PROXY must be true or false (empty defaults to false)');
    }

    normalizeSiteOrigin(config.public.siteOrigin);
    if (typeof config.public.cloudflareAnalyticsToken !== 'string') {
        throw new Error('NUXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN must be a string');
    }
    // Nitro 2 does not await plugin promises. Keep configuration validation synchronous.
    const redis = getRedis();
    const initialization = verifyDataKeyCanary(key).then(async () => {
        if (redis.status !== 'ready') {
            await new Promise<void>(resolve => {
                const finish = () => {
                    clearTimeout(timer);
                    redis.off('ready', finish);
                    redis.off('error', finish);
                    resolve();
                };
                const timer = setTimeout(finish, 1000);
                redis.once('ready', finish);
                redis.once('error', finish);
            });
        }
    });
    // No route, including health/readiness, may run before the stored key is validated.
    const removeBarrier = nitroApp.hooks.hook('request', () => initialization);
    void initialization.then(removeBarrier, () => {
        console.error('Runtime data encryption validation failed; refusing to serve');
        process.exit(1);
    });
    nitroApp.hooks.hook('close', async () => {
        if (redis.status === 'ready') await redis.quit().catch(() => redis.disconnect());
        else redis.disconnect();
        await prisma.$disconnect();
    });
});
