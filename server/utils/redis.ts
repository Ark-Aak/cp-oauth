import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis {
    if (!redis) {
        const config = useRuntimeConfig();
        redis = new Redis(config.redisUrl, {
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });
        redis.connect().catch(() => {});
    }
    return redis;
}
