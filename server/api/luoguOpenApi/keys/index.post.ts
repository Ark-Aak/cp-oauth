import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { base32Encode } from '@ctrl/ts-base32';
import { getUserIdFromEvent } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';
import { bitEncode } from '~/server/utils/bit-codec';
import {
    encryptData,
    getLuoguOpenApiCredentialCache,
    hasLuoguOpenApiCredentialCache
} from '~/server/utils/luogu-openapi-credentials';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const body = await readBody(event);

    if (!body || typeof body !== 'object') {
        throw createError({ statusCode: 400, message: 'Invalid request body' });
    }

    const note =
        'note' in body && typeof body.note === 'string' && body.note.trim()
            ? body.note.trim().slice(0, 100)
            : 'default';

    if (!hasLuoguOpenApiCredentialCache(userId)) {
        throw createError({ statusCode: 428, message: 'Luogu credential decrypt is required' });
    }

    const secret = await prisma.luoguApiSecert.findUnique({
        where: { userId },
        select: { userId: true }
    });

    if (!secret) {
        throw createError({ statusCode: 404, message: 'Luogu OpenAPI credential is not setup' });
    }

    const cachedCredential = getLuoguOpenApiCredentialCache(userId);
    if (!cachedCredential) {
        throw createError({ statusCode: 428, message: 'Luogu credential decrypt is required' });
    }

    const keyIdBuffer = crypto.randomBytes(20);
    const keyId = bitEncode(keyIdBuffer);
    const tokenBuffer = crypto.randomBytes(20);
    const keyBase32 = base32Encode(keyIdBuffer).replace(/=+$/g, '');
    const tokenBase32 = base32Encode(tokenBuffer).replace(/=+$/g, '');
    const passwordHash = await bcrypt.hash(tokenBase32, 10);

    try {
        const encryptedDek = encryptData(
            cachedCredential.dek,
            crypto.createHash('sha256').update(tokenBuffer).digest()
        );

        await prisma.luoguApiToken.create({
            data: {
                keyId,
                userId,
                passwordHash,
                encryptedDEK: bitEncode(encryptedDek),
                note
            }
        });

        return {
            keyId,
            keyBase32,
            note,
            tokenBase32
        };
    } finally {
        keyIdBuffer.fill(0);
        tokenBuffer.fill(0);
        cachedCredential.dek.fill(0);
    }
});
