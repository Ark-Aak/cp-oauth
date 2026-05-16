import bcrypt from 'bcryptjs';
import { generateSecret, generateURI, verify } from 'otplib';
import { getRedis } from '~/server/utils/redis';
import { randomInt } from 'node:crypto';

const TWO_FACTOR_LOGIN_CHALLENGE_PREFIX = '2fa:login:';
const TWO_FACTOR_SETUP_EMAIL_PREFIX = '2fa:setup:email:';
const TWO_FACTOR_SETUP_TOTP_PREFIX = '2fa:setup:totp:';
const PASSKEY_REGISTER_CHALLENGE_PREFIX = 'passkey:register:';
const PASSKEY_LOGIN_CHALLENGE_PREFIX = 'passkey:login:';

export type TwoFactorMethod = 'email_otp' | 'totp';

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
    return `${TWO_FACTOR_LOGIN_CHALLENGE_PREFIX}${challengeId}`;
}

export function build2faSetupEmailKey(userId: string): string {
    return `${TWO_FACTOR_SETUP_EMAIL_PREFIX}${userId}`;
}

export function build2faSetupTotpKey(userId: string): string {
    return `${TWO_FACTOR_SETUP_TOTP_PREFIX}${userId}`;
}

export function buildPasskeyRegisterChallengeKey(userId: string): string {
    return `${PASSKEY_REGISTER_CHALLENGE_PREFIX}${userId}`;
}

export function buildPasskeyLoginChallengeKey(challengeId: string): string {
    return `${PASSKEY_LOGIN_CHALLENGE_PREFIX}${challengeId}`;
}

export async function setRedisJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function getRedisJson<T>(key: string): Promise<T | null> {
    const raw = await getRedis().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
}

export async function delRedisKey(key: string): Promise<void> {
    await getRedis().del(key);
}

export function generateTotpSecret(): string {
    return generateSecret();
}

export async function verifyTotp(secret: string, token: string): Promise<boolean> {
    const result = await verify({ secret, token });
    return result.valid;
}

export function buildTotpOtpauthUrl(email: string, secret: string): string {
    return generateURI({
        label: email,
        secret,
        issuer: 'CP OAuth'
    });
}
