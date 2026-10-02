import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verify } from 'otplib';
import { createError, setHeader, type H3Event } from 'h3';
import { randomInt } from 'node:crypto';
import { getRedis } from '~/server/utils/redis';
import { hashToken } from '~/server/utils/token-hash';
import { getDataEncryptionKey } from '~/server/utils/data-encryption';
import { decryptSecret } from '~/server/utils/secrets';

const PREFIX = 'cp-oauth:v2:';

export async function securityRedis<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (
            error &&
            typeof error === 'object' &&
            'statusCode' in error &&
            typeof error.statusCode === 'number'
        )
            throw error;
        throw createError({
            statusCode: 503,
            message: 'Authentication security is temporarily unavailable'
        });
    }
}

export function generateSixDigitCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function hashCode(code: string): Promise<string> {
    return bcrypt.hash(code, 10);
}

export async function verifyCodeHash(code: string, hash: string): Promise<boolean> {
    return bcrypt.compare(code, hash);
}

export function build2faLoginChallengeKey(challengeId: string): string {
    return `${PREFIX}2fa:login:${challengeId}`;
}

export function build2faSetupEmailKey(userId: string, sessionId: string): string {
    return `${PREFIX}2fa:setup:email:${userId}:${sessionId}`;
}

export function build2faSetupTotpKey(userId: string, sessionId: string): string {
    return `${PREFIX}2fa:setup:totp:${userId}:${sessionId}`;
}

export function buildPasskeyRegisterChallengeKey(userId: string, sessionId: string): string {
    return `${PREFIX}passkey:register:${userId}:${sessionId}`;
}

export function buildPasskeyLoginChallengeKey(challengeId: string): string {
    return `${PREFIX}passkey:login:${challengeId}`;
}

export async function setRedisJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await securityRedis(() => getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds));
}

export async function getRedisJson<T>(key: string): Promise<T | null> {
    const entry = await getRedisJsonWithRaw<T>(key);
    return entry?.value ?? null;
}

export async function getRedisJsonWithRaw<T>(
    key: string
): Promise<{ raw: string; value: T } | null> {
    return securityRedis(async () => {
        const raw = await getRedis().get(key);
        return raw ? { raw, value: JSON.parse(raw) as T } : null;
    });
}

export async function consumeRedisJson<T>(key: string): Promise<T | null> {
    return securityRedis(async () => {
        const raw = await getRedis().eval(
            "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
            1,
            key
        );
        return typeof raw === 'string' ? (JSON.parse(raw) as T) : null;
    });
}

export async function deleteRedisKeyIfValue(key: string, expectedValue: string): Promise<boolean> {
    const result = await securityRedis(() =>
        getRedis().eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
            1,
            key,
            expectedValue
        )
    );
    return Number(result) === 1;
}

export async function delRedisKey(key: string): Promise<void> {
    await securityRedis(() => getRedis().del(key));
}

export function authChallengeExpired(): never {
    throw createError({
        statusCode: 400,
        message: 'Authentication challenge is invalid or expired',
        data: { code: 'AUTH_CHALLENGE_EXPIRED' }
    });
}

export async function consumeChallengeAttempt(event: H3Event, key: string): Promise<void> {
    const result = Number(
        await securityRedis(() =>
            getRedis().eval(
                "local ttl = redis.call('PTTL', KEYS[1]); if ttl <= 0 then return 0 end; local count = redis.call('INCR', KEYS[2]); if count == 1 then redis.call('PEXPIRE', KEYS[2], ttl); end; if count > 5 then redis.call('DEL', KEYS[1]); return -1 end; return count",
                2,
                key,
                `${key}:attempts`
            )
        )
    );
    if (result === 0) authChallengeExpired();
    if (result < 0) {
        setHeader(event, 'Retry-After', 600);
        throw createError({
            statusCode: 429,
            message: 'Too many verification attempts; start again',
            data: { code: 'AUTH_CHALLENGE_EXHAUSTED' }
        });
    }
}

export function generateTotpSecret(): string {
    return generateSecret();
}

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
    const result = await verify({ secret, token });
    return result.valid;
}

export function decryptTotpSecret(value: string, userId: string): string {
    try {
        return decryptSecret(value, `User:totpSecret:${userId}`, getDataEncryptionKey());
    } catch {
        throw createError({
            statusCode: 503,
            message: 'Authenticator data is temporarily unavailable'
        });
    }
}

export async function claimTotpCode(userId: string, code: string): Promise<void> {
    const claimed = await securityRedis(() =>
        getRedis().set(`${PREFIX}auth:totp-used:${userId}:${hashToken(code)}`, '1', 'EX', 90, 'NX')
    );
    if (claimed !== 'OK') {
        throw createError({
            statusCode: 401,
            message: 'This verification code has already been used',
            data: { code: 'INVALID_MFA_CODE' }
        });
    }
}

export function buildTotpOtpauthUrl(email: string, secret: string): string {
    return generateURI({ label: email, secret, issuer: 'CP OAuth' });
}
