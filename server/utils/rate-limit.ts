import { createHmac } from 'node:crypto';
import { createError, getRequestIP, setHeader, type H3Event } from 'h3';
import { getRedis } from '~/server/utils/redis';
import { securityRedis } from '~/server/utils/security';

type RateAction = 'login' | 'register' | 'email' | 'challenge' | 'mfa';
const LIMITS: Record<RateAction, { window: number; ip: number; principal?: number }> = {
    login: { window: 900, ip: 60, principal: 10 },
    register: { window: 3600, ip: 10 },
    email: { window: 3600, ip: 20, principal: 3 },
    challenge: { window: 600, ip: 30, principal: 5 },
    mfa: { window: 600, ip: 60, principal: 5 }
};

export async function enforceRateLimit(
    event: H3Event,
    action: RateAction,
    principal?: string
): Promise<void> {
    const config = useRuntimeConfig();
    const trustProxy = String(config.trustProxy) === 'true';
    const ip =
        (trustProxy
            ? getRequestIP(event, { xForwardedFor: true })
            : event.node.req.socket?.remoteAddress) || 'unknown';
    const limit = LIMITS[action];
    const identities = [`ip:${ip}`];
    if (principal && limit.principal) identities.push(`principal:${principal}`);
    const keys = identities.map(
        identity =>
            `cp-oauth:v2:rate:${action}:${createHmac('sha256', config.jwtSecret).update(identity).digest('hex')}`
    );
    const maxima = [limit.ip, limit.principal || limit.ip];
    const retryAfter = Number(
        await securityRedis(() =>
            getRedis().eval(
                "local retry = 0; for i, key in ipairs(KEYS) do local count = redis.call('INCR', key); if count == 1 then redis.call('EXPIRE', key, ARGV[1]); end; if count > tonumber(ARGV[i + 1]) then local ttl = redis.call('TTL', key); if ttl > retry then retry = ttl; end; end; end; return retry",
                keys.length,
                ...keys,
                limit.window,
                ...maxima
            )
        )
    );
    if (retryAfter > 0) {
        setHeader(event, 'Retry-After', retryAfter);
        throw createError({
            statusCode: 429,
            message: 'Too many requests; please try again later',
            data: { code: 'RATE_LIMITED' }
        });
    }
}
