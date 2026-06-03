import { base32Encode } from '@ctrl/ts-base32';
import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { bitDecode } from '~/server/utils/bit-codec';
import { hasLuoguOpenApiCredentialCache } from '~/server/utils/luogu-openapi-credentials';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);

    const keys = await prisma.luoguApiSecert.findUnique({
        where: {
            userId
        },
        select: {
            luoguUid: true,
            apiTokens: {
                select: {
                    keyId: true,
                    createdAt: true,
                    note: true
                }
            }
        }
    });

    if (!keys) {
        return null;
    }

    return {
        ...keys,
        apiTokens: keys.apiTokens.map(item => ({
            createdAt: item.createdAt,
            note: item.note,
            keyId: base32Encode(bitDecode(item.keyId)).replace(/=+$/g, '')
        })),
        decryptReady: hasLuoguOpenApiCredentialCache(userId)
    };
});
