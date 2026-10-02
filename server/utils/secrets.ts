import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const DATA_KEY_CHECK_KEY = '__data_key_check';
export const DATA_KEY_CHECK_CONTEXT = `SystemConfig:${DATA_KEY_CHECK_KEY}`;
export const DATA_KEY_CHECK_VALUE = 'cp-oauth-key-check-v1';

export function decodeDataEncryptionKey(value: string): Uint8Array {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=?$/.test(value)) {
        throw new Error('NUXT_DATA_ENCRYPTION_KEY must encode exactly 32 bytes in base64');
    }
    const key = Buffer.from(value, 'base64');
    if (
        key.length !== 32 ||
        key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')
    ) {
        throw new Error('NUXT_DATA_ENCRYPTION_KEY must encode exactly 32 bytes in base64');
    }
    return key;
}

function validateArguments(value: string, context: string, key: Uint8Array): void {
    if (typeof value !== 'string') throw new TypeError('Secret must be a string');
    if (typeof context !== 'string' || !context) {
        throw new TypeError('Secret context must be a non-empty string');
    }
    if (!(key instanceof Uint8Array) || key.byteLength !== 32) {
        throw new TypeError('Encryption key must contain exactly 32 bytes');
    }
}

export function encryptSecret(value: string, context: string, key: Uint8Array): string {
    validateArguments(value, context, key);
    if (!value) return '';

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function decodeEnvelopePart(value: string): Buffer {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid secret envelope');
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) throw new Error('Invalid secret envelope');
    return decoded;
}

export function decryptSecret(value: string, context: string, key: Uint8Array): string {
    validateArguments(value, context, key);
    if (!value) return '';

    try {
        const parts = value.split(':');
        if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
            throw new Error('Invalid secret envelope');
        }
        const iv = decodeEnvelopePart(parts[2]!);
        const tag = decodeEnvelopePart(parts[3]!);
        const ciphertext = decodeEnvelopePart(parts[4]!);
        if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid secret envelope');

        const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
        decipher.setAAD(Buffer.from(context, 'utf8'));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
        throw new Error('Unable to decrypt secret');
    }
}
