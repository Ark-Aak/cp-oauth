import { createHash, hkdfSync } from 'node:crypto';
import { consola } from 'consola';
import { createError } from 'h3';
import {
    generateChallenge,
    validateChallenge,
    type ChallengeResult,
    type ValidateChallengeBody
} from 'capjs-core';
import { getConfig } from './config';
import { getDataEncryptionKey } from './data-encryption';
import { getRedis } from './redis';
import { securityRedis } from './security';

const logger = consola.withTag('security:cap');

const NONCE_PREFIX = 'cp-oauth:v2:cap:nonce:';
const TOKEN_PREFIX = 'cp-oauth:v2:cap:token:';

export const CAP_SCOPES = ['login', 'register', 'luogu_challenge'] as const;
export type CapScope = (typeof CAP_SCOPES)[number];
const CAP_SCOPES_MAP: Record<CapScope, true> = {
    login: true,
    register: true,
    luogu_challenge: true
};

export function parseCapScope(value: unknown): CapScope {
    if (typeof value === 'string' && Object.hasOwn(CAP_SCOPES_MAP, value)) {
        return value as CapScope;
    }
    throw createError({ statusCode: 404, message: 'Unknown captcha scope' });
}

export function getCapSecret(): Buffer {
    const configured = useRuntimeConfig().capSecret;
    if (typeof configured === 'string' && configured.trim()) {
        return Buffer.from(configured, 'utf8');
    }
    return Buffer.from(
        hkdfSync('sha256', getDataEncryptionKey(), '', 'cp-oauth:cap-signing-secret:v1', 32)
    );
}

/**
 * Re-derives the storage key from a Cap redeem token (`id:secret`) using the exact
 * capjs-core recipe (`id:sha256(secret)`). Returns null for malformed tokens.
 */
export function deriveCapTokenKey(token: string): string | null {
    const trimmed = token.trim();
    const sep = trimmed.indexOf(':');
    if (sep <= 0 || sep === trimmed.length - 1 || trimmed.indexOf(':', sep + 1) !== -1) {
        return null;
    }
    const id = trimmed.slice(0, sep);
    const secret = trimmed.slice(sep + 1);
    if (!/^[a-f0-9]+$/i.test(id) || !/^[a-f0-9]+$/i.test(secret)) {
        return null;
    }
    return `${id}:${createHash('sha256').update(secret).digest('hex')}`;
}

export async function isCapEnabled(): Promise<boolean> {
    const { cap_enabled: capEnabled } = await getConfig(['cap_enabled']);
    return capEnabled === 'true';
}

export async function consumeCapNonce(sigHex: string, ttlMs: number): Promise<boolean> {
    const ttl = Math.max(1000, Math.ceil(ttlMs));
    const result = await securityRedis(() =>
        getRedis().set(`${NONCE_PREFIX}${sigHex}`, '1', 'PX', ttl, 'NX')
    );
    return result === 'OK';
}

export async function storeCapToken(
    scope: CapScope,
    tokenKey: string,
    expires: number
): Promise<void> {
    const ttlMs = expires - Date.now();
    if (ttlMs <= 0) return;
    await securityRedis(() =>
        getRedis().set(`${TOKEN_PREFIX}${scope}:${tokenKey}`, String(expires), 'PX', ttlMs)
    );
}

/** Atomically reads and deletes a single-use Cap token from Redis. */
export async function consumeCapToken(scope: CapScope, tokenKey: string): Promise<number | null> {
    const raw = await securityRedis(() =>
        getRedis().eval(
            "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
            1,
            `${TOKEN_PREFIX}${scope}:${tokenKey}`
        )
    );
    if (typeof raw !== 'string') return null;
    const expires = Number(raw);
    return Number.isFinite(expires) ? expires : null;
}

export async function createCapChallenge(
    scope: CapScope,
    options?: { noWasm?: boolean; secret?: string | Buffer }
): Promise<ChallengeResult> {
    const secret = options?.secret ?? getCapSecret();
    if (options?.noWasm) {
        return generateChallenge(secret, {
            scope,
            format: 2,
            protocols: ['sha256-pow', 'instrumentation'],
            instrumentation: { noWasm: true }
        });
    }
    return generateChallenge(secret, {
        scope,
        format: 2,
        protocols: ['hashwx', 'instrumentation']
    });
}

export interface RedeemCapResponse {
    success: boolean;
    token?: string;
    expires?: number;
    reason?: string;
    error?: string;
    instr_error?: boolean;
    blockedBy?: string[];
}

export async function redeemCapChallenge(
    scope: CapScope,
    body: ValidateChallengeBody,
    options?: {
        secret?: string | Buffer;
        consumeNonce?: (sigHex: string, ttlMs: number) => Promise<boolean> | boolean;
        storeToken?: (scope: CapScope, tokenKey: string, expires: number) => Promise<void>;
    }
): Promise<RedeemCapResponse> {
    const secret = options?.secret ?? getCapSecret();
    const result = await validateChallenge(secret, body, {
        scope,
        consumeNonce: options?.consumeNonce ?? consumeCapNonce
    });

    if (!result.success) {
        return {
            success: false,
            reason: result.reason,
            ...(result.error ? { error: result.error } : {}),
            ...(result.instr_error ? { instr_error: true } : {}),
            ...(result.blockedBy ? { blockedBy: result.blockedBy } : {})
        };
    }

    if (!result.tokenKey) {
        throw createError({ statusCode: 500, message: 'Captcha token generation failed' });
    }

    await (options?.storeToken ?? storeCapToken)(scope, result.tokenKey, result.expires);

    return {
        success: true,
        token: result.token,
        expires: result.expires
    };
}

export async function verifyCapToken(params: {
    token: string | null | undefined;
    action: CapScope;
}): Promise<void> {
    if (!(await isCapEnabled())) {
        return;
    }

    const token = params.token?.trim();
    if (!token) {
        logger.warn(`Captcha required but missing for ${params.action}`);
        throw createError({ statusCode: 400, message: 'Captcha verification required' });
    }

    const tokenKey = deriveCapTokenKey(token);
    if (!tokenKey) {
        logger.warn(`Captcha token malformed for ${params.action}`);
        throw createError({ statusCode: 400, message: 'Captcha verification failed' });
    }

    const expires = await consumeCapToken(params.action, tokenKey);
    if (!expires || expires <= Date.now()) {
        logger.warn(`Captcha verification failed for ${params.action}`);
        throw createError({ statusCode: 400, message: 'Captcha verification failed' });
    }
}
