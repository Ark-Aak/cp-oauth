import { getRedis } from '~/server/utils/redis';

interface HitokotoResponse {
    hitokoto?: string;
    from?: string;
    from_who?: string | null;
}

const CACHE_KEY = 'hitokoto:latest';
const CACHE_TTL = 300; // 5 minutes

export default defineEventHandler(async () => {
    const redis = getRedis();

    try {
        const cached = await redis.get(CACHE_KEY);
        if (cached) return JSON.parse(cached);
    } catch {
        // Redis unavailable
    }

    try {
        const data = await $fetch<HitokotoResponse>('https://v1.hitokoto.cn/?encode=json', {
            timeout: 5000,
            retry: 0
        });

        if (!data.hitokoto) {
            throw new Error('Invalid hitokoto response');
        }

        const result = {
            text: data.hitokoto,
            source: data.from || 'Hitokoto',
            fromWho: data.from_who || null
        };

        try {
            await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL);
        } catch {
            // Redis unavailable
        }

        return result;
    } catch {
        return {
            text: 'Competitive programming is not only about solving problems, but expanding the boundaries of thought.',
            source: 'CP OAuth',
            fromWho: null
        };
    }
});
