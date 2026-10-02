import { createError } from 'h3';
import { getDataEncryptionKey } from './data-encryption';
import { encryptSecret, decryptSecret } from './secrets';

export type LinkedAccountTokenField = 'oauthAccessToken' | 'oauthRefreshToken' | 'oauthIdToken';
export type LinkedAccountTokens = Partial<Record<LinkedAccountTokenField, string | null>>;

export function encryptLinkedAccountTokens(
    id: string,
    tokens: LinkedAccountTokens
): LinkedAccountTokens {
    const key = getDataEncryptionKey();
    const encrypted: LinkedAccountTokens = {};
    for (const field of ['oauthAccessToken', 'oauthRefreshToken', 'oauthIdToken'] as const) {
        const value = tokens[field];
        if (value !== undefined) {
            encrypted[field] = value
                ? encryptSecret(value, `LinkedAccount:${field}:${id}`, key)
                : null;
        }
    }
    return encrypted;
}

export function decryptLinkedAccountToken(
    id: string,
    field: LinkedAccountTokenField,
    value: string | null | undefined
): string | null {
    if (!value) return null;
    try {
        return decryptSecret(value, `LinkedAccount:${field}:${id}`, getDataEncryptionKey());
    } catch {
        throw createError({
            statusCode: 503,
            message: 'Linked account credentials are unavailable'
        });
    }
}
