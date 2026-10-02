import { consola } from 'consola';
import Redis from 'ioredis';

const logger = consola.withTag('redis');

const infrastructure = globalThis as typeof globalThis & { cpOAuthRedis?: Redis };

export function getRedis(): Redis {
    if (!infrastructure.cpOAuthRedis) {
        const config = useRuntimeConfig();
        const redis = new Redis(config.redisUrl, {
            enableOfflineQueue: false,
            connectTimeout: 1000,
            commandTimeout: 1000,
            maxRetriesPerRequest: 1,
            lazyConnect: true
        });
        infrastructure.cpOAuthRedis = redis;
        redis.on('connect', () => logger.success('Redis connected'));
        redis.on('error', err => logger.error('Redis error:', err.message));
        redis.connect().catch(() => {});
    }
    return infrastructure.cpOAuthRedis;
}
