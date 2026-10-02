import { createError } from 'h3';
import prisma from './prisma';
import {
    DATA_KEY_CHECK_CONTEXT,
    DATA_KEY_CHECK_KEY,
    DATA_KEY_CHECK_VALUE,
    decodeDataEncryptionKey,
    decryptSecret
} from './secrets';

export function getDataEncryptionKey(): Uint8Array {
    try {
        return decodeDataEncryptionKey(useRuntimeConfig().dataEncryptionKey);
    } catch {
        throw createError({ statusCode: 503, message: 'Data encryption is unavailable' });
    }
}

export async function verifyDataKeyCanary(key: Uint8Array): Promise<void> {
    const row = await prisma.systemConfig.findUnique({ where: { key: DATA_KEY_CHECK_KEY } });
    if (!row) throw new Error('Data encryption key check is missing; run the encryption migration');
    try {
        if (decryptSecret(row.value, DATA_KEY_CHECK_CONTEXT, key) !== DATA_KEY_CHECK_VALUE) {
            throw new Error('Invalid key check');
        }
    } catch {
        throw new Error('Data encryption key check failed');
    }
}
