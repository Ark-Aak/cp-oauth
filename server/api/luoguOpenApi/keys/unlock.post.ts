import bcrypt from 'bcryptjs';
import { base32Encode } from '@ctrl/ts-base32';
import { getUserIdFromEvent } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';
import { bitDecode } from '~/server/utils/bit-codec';
import {
    clearLuoguOpenApiCredentialCache,
    decryptData,
    deriveKEK,
    setLuoguOpenApiCredentialCache
} from '~/server/utils/luogu-openapi-credentials';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const body = await readBody(event);

    if (
        !body ||
        typeof body !== 'object' ||
        !('encryptPassword' in body) ||
        typeof body.encryptPassword !== 'string' ||
        !body.encryptPassword
    ) {
        throw createError({ statusCode: 400, message: 'Invalid request body' });
    }

    const secret = await prisma.luoguApiSecert.findUnique({
        where: { userId },
        select: {
            luoguUid: true,
            passwordHash: true,
            kekSalt: true,
            encryptedDEK: true,
            encryptedLuoguWebAuthnClientRepo: true,
            encryptedLuoguClientId: true,
            valid: true
        }
    });

    if (!secret) {
        throw createError({ statusCode: 404, message: 'Luogu OpenAPI credential is not setup' });
    }

    const valid = await bcrypt.compare(body.encryptPassword, secret.passwordHash);
    if (!valid) {
        throw createError({ statusCode: 400, message: 'Invalid independent password' });
    }

    const salt = bitDecode(secret.kekSalt);
    const encryptedDek = bitDecode(secret.encryptedDEK);
    const encryptedWebauthn = bitDecode(secret.encryptedLuoguWebAuthnClientRepo);
    const encryptedClientId = bitDecode(secret.encryptedLuoguClientId);

    let kek: Buffer | null = null;
    let dek: Buffer | null = null;
    let webauthnRaw: Buffer | null = null;
    let clientIdRaw: Buffer | null = null;

    try {
        kek = await deriveKEK(body.encryptPassword, salt);
        dek = decryptData(encryptedDek, kek);
        webauthnRaw = decryptData(encryptedWebauthn, dek);
        clientIdRaw = decryptData(encryptedClientId, dek);

        const webauthn = webauthnRaw.toString('utf-8');
        JSON.parse(webauthn);
        const clientId = base32Encode(clientIdRaw).replace(/=+$/g, '');

        clearLuoguOpenApiCredentialCache(userId);
        setLuoguOpenApiCredentialCache(userId, {
            luoguUid: secret.luoguUid,
            dek,
            webauthn,
            clientId,
            valid: secret.valid
        });

        return {
            success: true,
            ttlMs: 15 * 60 * 1000
        };
    } catch {
        throw createError({ statusCode: 400, message: 'Failed to decrypt credential' });
    } finally {
        salt.fill(0);
        encryptedDek.fill(0);
        encryptedWebauthn.fill(0);
        encryptedClientId.fill(0);

        if (kek) {
            kek.fill(0);
        }
        if (dek) {
            dek.fill(0);
        }
        if (webauthnRaw) {
            webauthnRaw.fill(0);
        }
        if (clientIdRaw) {
            clientIdRaw.fill(0);
        }
    }
});
