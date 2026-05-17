import { base32Decode } from '@ctrl/ts-base32';
import { getUserIdFromEvent } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';
import { bitEncode } from '~/server/utils/bit-codec';
import { clearLuoguOpenApiValidationCacheByKeyId } from '~/server/utils/luogu-openapi-credentials';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const keyIdBase32 = getRouterParam(event, 'keyIdBase32');

    if (!keyIdBase32 || typeof keyIdBase32 !== 'string') {
        throw createError({ statusCode: 400, message: 'Invalid key ID' });
    }

    const keyIdBuffer = base32Decode(keyIdBase32);
    if (keyIdBuffer.length !== 20) {
        throw createError({ statusCode: 400, message: 'Invalid key ID' });
    }

    const keyId = bitEncode(Buffer.from(keyIdBuffer));
    const result = await prisma.luoguApiToken.deleteMany({
        where: {
            userId,
            keyId
        }
    });

    clearLuoguOpenApiValidationCacheByKeyId(keyId);

    if (result.count === 0) {
        throw createError({ statusCode: 404, message: 'Luogu API key not found' });
    }

    return {
        success: true
    };
});
