import { getRedis } from '~/server/utils/redis';
import { z } from 'zod';
import type { QuoteSummary } from '~/types/api';

interface HitokotoResponse {
    hitokoto?: string;
    from?: string;
    from_who?: string | null;
}

const CACHE_KEY = 'hitokoto:latest';
const CACHE_TTL = 300; // 5 minutes
const FALLBACK: QuoteSummary = {
    text: 'Competitive programming is not only about solving problems, but expanding the boundaries of thought.',
    source: 'CP OAuth',
    fromWho: null
};
const quoteSchema = z.object({
    text: z.string().min(1),
    source: z.string().min(1),
    fromWho: z.string().nullable()
});
let lastGood: QuoteSummary | null = null;
let freshUntil = 0;
let failureCooldownUntil = 0;
let inFlight: Promise<QuoteSummary> | null = null;

export default defineEventHandler(async () => {
    if (Date.now() < freshUntil || Date.now() < failureCooldownUntil) return lastGood ?? FALLBACK;
    if (inFlight) return inFlight;
    const request = (async () => {
        const redis = getRedis();
        try {
            const cached = await redis.get(CACHE_KEY);
            if (cached) {
                const parsed = quoteSchema.safeParse(JSON.parse(cached));
                if (parsed.success) {
                    const ttl = await redis.ttl(CACHE_KEY);
                    if (ttl > 0) {
                        lastGood = parsed.data;
                        freshUntil = Date.now() + Math.min(ttl, CACHE_TTL) * 1000;
                        return parsed.data;
                    }
                }
            }
        } catch {
            // A cache failure does not discard a real last-good quote.
        }
        try {
            const data = await $fetch<HitokotoResponse>('https://v1.hitokoto.cn/?encode=json', {
                timeout: 10_000,
                retry: 0
            });
            const result = quoteSchema.parse({
                text: data.hitokoto,
                source: data.from || 'Hitokoto',
                fromWho: data.from_who || null
            });
            lastGood = result;
            freshUntil = Date.now() + CACHE_TTL * 1000;
            failureCooldownUntil = 0;
            try {
                await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL);
            } catch {
                // The process snapshot prevents repeated upstream calls on cache outages.
            }
            return result;
        } catch {
            failureCooldownUntil = Date.now() + 60_000;
            return lastGood ?? FALLBACK;
        }
    })();
    inFlight = request;
    try {
        return await request;
    } finally {
        inFlight = null;
    }
});
