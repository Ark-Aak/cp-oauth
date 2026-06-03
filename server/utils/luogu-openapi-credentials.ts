/* Do not store these credentials to redis because they are too sensitive.
 * Instead, we will just store them in memory for safety, which also means that they will be lost when the server restarts.
 * This is acceptable because these credentials can be easily re-decrypted from the database when needed.
 */
import { consola } from 'consola';
import { createLuoguSessionToken, type LuoguSessionToken } from './fetch-luogu';
import crypto from 'node:crypto';

const LUOGU_OPENAPI_CREDENTIAL_CACHE_TTL_MS = 15 * 60 * 1000;
const luoguLoginTokenCache = new Map<
    string,
    { value: LuoguSessionToken; timeout: NodeJS.Timeout }
>();
type LuoguOpenApiCredentialCacheValue = {
    luoguUid: number;
    dek: Buffer;
    webauthn: string;
    clientId: string;
    csrf?: string;
    valid: boolean;
};
type LuoguOpenApiValidationCacheValue = {
    userId: string;
    encryptedDEK: string;
};
type LuoguOpenApiValidationCacheInternalValue = LuoguOpenApiValidationCacheValue & {
    tokenDigest: string;
};
const luoguOpenApiCredentialCache = new Map<
    string,
    { value: LuoguOpenApiCredentialCacheValue; timeout: NodeJS.Timeout }
>();
const luoguOpenApiValidationCache = new Map<
    string,
    { value: LuoguOpenApiValidationCacheInternalValue; timeout: NodeJS.Timeout }
>();

const logger = consola.withTag('luogu-openapi-credentials');

function resetMapCache<T>(
    cache: Map<string, { value: T; timeout: NodeJS.Timeout }>,
    cacheKey: string
) {
    const old = cache.get(cacheKey);
    if (old) {
        clearTimeout(old.timeout);
        cache.delete(cacheKey);
    }
}

function setMapCache<T>(
    cache: Map<string, { value: T; timeout: NodeJS.Timeout }>,
    cacheKey: string,
    value: T
) {
    resetMapCache(cache, cacheKey);
    cache.set(cacheKey, {
        value,
        timeout: setTimeout(() => {
            cache.delete(cacheKey);
            logger.log(`Luogu credential cache for key ${cacheKey} has expired and been removed.`);
        }, LUOGU_OPENAPI_CREDENTIAL_CACHE_TTL_MS)
    });
}

function getMapCache<T>(
    cache: Map<string, { value: T; timeout: NodeJS.Timeout }>,
    cacheKey: string
): T | null {
    const item = cache.get(cacheKey);
    if (item) {
        clearTimeout(item.timeout);
        item.timeout = setTimeout(() => {
            cache.delete(cacheKey);
            logger.log(`Luogu credential cache for key ${cacheKey} has expired and been removed.`);
        }, LUOGU_OPENAPI_CREDENTIAL_CACHE_TTL_MS);
        return item.value;
    }
    return null;
}

function digestTokenBase32(tokenBase32: string): string {
    return crypto.createHash('sha256').update(tokenBase32).digest('hex');
}

export async function createLuoguLoginToken(userId: string) {
    const token = await createLuoguSessionToken();
    setMapCache(luoguLoginTokenCache, userId, token);
    return token;
}
export function getLuoguLoginToken(userId: string): LuoguSessionToken {
    const token = getMapCache(luoguLoginTokenCache, userId);
    if (!token) {
        throw new Error('Luogu login token not found for user ' + userId);
    }
    return token;
}
export function clearLuoguLoginToken(userId: string) {
    resetMapCache(luoguLoginTokenCache, userId);
}

export function setLuoguOpenApiCredentialCache(
    userId: string,
    value: LuoguOpenApiCredentialCacheValue
) {
    setMapCache(luoguOpenApiCredentialCache, userId, {
        ...value,
        dek: Buffer.from(value.dek)
    });
}

export function clearLuoguOpenApiCredentialCache(userId: string) {
    const cache = luoguOpenApiCredentialCache.get(userId)?.value;
    if (cache) {
        cache.dek.fill(0);
    }
    resetMapCache(luoguOpenApiCredentialCache, userId);
}

export function getLuoguOpenApiCredentialCache(
    userId: string
): LuoguOpenApiCredentialCacheValue | null {
    const cache = getMapCache(luoguOpenApiCredentialCache, userId);
    if (!cache) {
        return null;
    }
    return {
        ...cache,
        dek: Buffer.from(cache.dek)
    };
}

export function hasLuoguOpenApiCredentialCache(userId: string): boolean {
    return Boolean(getMapCache(luoguOpenApiCredentialCache, userId));
}

export function setLuoguOpenApiValidationCache(
    keyId: string,
    tokenBase32: string,
    value: LuoguOpenApiValidationCacheValue
) {
    setMapCache(luoguOpenApiValidationCache, keyId, {
        tokenDigest: digestTokenBase32(tokenBase32),
        userId: value.userId,
        encryptedDEK: value.encryptedDEK
    });
}

export function getLuoguOpenApiValidationCache(
    keyId: string,
    tokenBase32: string
): LuoguOpenApiValidationCacheValue | null {
    const cache = getMapCache(luoguOpenApiValidationCache, keyId);
    if (!cache) {
        return null;
    }

    const tokenDigest = digestTokenBase32(tokenBase32);
    if (cache.tokenDigest !== tokenDigest) {
        return null;
    }

    return {
        userId: cache.userId,
        encryptedDEK: cache.encryptedDEK
    };
}

export function clearLuoguOpenApiValidationCacheByKeyId(keyId: string) {
    resetMapCache(luoguOpenApiValidationCache, keyId);
}

export async function deriveKEK(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) =>
        crypto.scrypt(
            password,
            salt,
            32,
            {
                N: 1 << 14,
                r: 8,
                p: 1,
                maxmem: 32 * 1024 * 1024
            },
            (err, derivedKey) => (err ? reject(err) : resolve(derivedKey))
        )
    );
}
export function encryptData(value: Buffer | Uint8Array, key: Buffer): Buffer {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    let ct = cipher.update(value);
    ct = Buffer.concat([ct, cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, ct, tag]);
}
export function decryptData(encryptedValue: Buffer, key: Buffer): Buffer {
    const nonce = encryptedValue.subarray(0, 12);
    const tag = encryptedValue.subarray(encryptedValue.length - 16);
    const ct = encryptedValue.subarray(12, encryptedValue.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    let dek = decipher.update(ct);
    dek = Buffer.concat([dek, decipher.final()]);
    return dek;
}
