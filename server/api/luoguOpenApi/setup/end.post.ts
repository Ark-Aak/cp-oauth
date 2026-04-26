import { bitEncode } from '~/server/utils/bit-codec';
import {
    clearLuoguLoginToken,
    deriveKEK,
    encryptData,
    getLuoguLoginToken,
    setLuoguOpenApiCredentialCache
} from '~/server/utils/luogu-openapi-credentials';
import { getLuoguWebAuthnSetupOptions, registerLuoguWebAuthn } from '~/server/utils/fetch-luogu';
import prisma from '~/server/utils/prisma';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { base32Decode } from '@ctrl/ts-base32';
import { consola } from 'consola';
import { getUserIdFromEvent } from '~/server/utils/auth';

import { emulateLuoguWebAuthnRegister } from '~/server/utils/luogu-webauthn-emulator';

const logger = consola.withTag('api-luogu-openapi-setup');

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const luoguToken = getLuoguLoginToken(userId);
    const body = await readBody(event);
    if (
        !body ||
        typeof body !== 'object' ||
        !('encryptPassword' in body) ||
        typeof body.encryptPassword !== 'string'
    ) {
        throw createError({
            statusCode: 400,
            message: 'Invalid request body'
        });
    }

    const webauthnOptions = await getLuoguWebAuthnSetupOptions(luoguToken);
    const { response, repository } = emulateLuoguWebAuthnRegister(webauthnOptions);
    await registerLuoguWebAuthn(luoguToken, response);

    const passwordHash = await bcrypt.hash(body.encryptPassword, 10);
    const kekSalt = crypto.randomBytes(32);
    const dek = crypto.randomBytes(32);
    const kek = await deriveKEK(body.encryptPassword, kekSalt);
    let encryptedDEK: Buffer,
        encryptedLuoguWebAuthnClientRepo: Buffer,
        encryptedLuoguClientId: Buffer;
    try {
        encryptedDEK = encryptData(dek, kek);
        encryptedLuoguWebAuthnClientRepo = encryptData(Buffer.from(repository), dek);
        encryptedLuoguClientId = encryptData(Buffer.from(base32Decode(luoguToken.clientId)), dek);

        setLuoguOpenApiCredentialCache(userId, {
            luoguUid: luoguToken.uid,
            dek,
            webauthn: repository,
            clientId: luoguToken.clientId,
            valid: true
        });
    } catch (e) {
        logger.error('Failed to encrypt Luogu OpenAPI credential data:', e);
        throw createError({
            statusCode: 500,
            message: 'Failed to encrypt Luogu OpenAPI credential data'
        });
    } finally {
        dek.fill(0);
        kek.fill(0);
    }
    try {
        await prisma.luoguApiSecert.create({
            data: {
                userId: userId,
                passwordHash,
                kekSalt: bitEncode(kekSalt),
                encryptedDEK: bitEncode(encryptedDEK),
                luoguUid: luoguToken.uid,
                encryptedLuoguClientId: bitEncode(encryptedLuoguClientId),
                encryptedLuoguWebAuthnClientRepo: bitEncode(encryptedLuoguWebAuthnClientRepo)
            }
        });
        clearLuoguLoginToken(userId);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw createError({
                statusCode: 409,
                message: 'Luogu OpenAPI credential already exists'
            });
        } else {
            logger.error('Failed to save Luogu OpenAPI credential:', error);
            throw createError({
                statusCode: 500,
                message: 'Failed to save Luogu OpenAPI credential'
            });
        }
    }
});
