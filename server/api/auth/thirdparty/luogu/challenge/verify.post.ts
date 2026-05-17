import { getPlatformVerifier } from '~/server/utils/platforms';
import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';
import { createAuthUserResponse } from '~/server/utils/user-response';

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const requestId = String(body.requestId || '').trim();
    const credential = String(body.credential || '').trim();

    if (!requestId || !credential) {
        throw createError({ statusCode: 400, message: 'requestId and credential are required' });
    }

    const redis = getRedis();
    const key = `auth:luogu:challenge:${requestId}`;
    const raw = await redis.get(key);
    if (!raw) {
        throw createError({
            statusCode: 400,
            message: 'Challenge request expired or not found'
        });
    }

    const { code, platformUid } = JSON.parse(raw) as { code: string; platformUid: string };

    const verifier = getPlatformVerifier('luogu');
    if (!verifier) {
        throw createError({ statusCode: 500, message: 'Luogu verifier is unavailable' });
    }

    const result = await verifier.verify({ platformUid, code, credential });
    if (!result.success) {
        throw createError({ statusCode: 400, message: result.error || 'Verification failed' });
    }

    const linked = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'luogu',
                platformUid: result.platformUid
            }
        },
        select: {
            userId: true
        }
    });

    if (!linked) {
        throw createError({ statusCode: 404, message: 'This Luogu account has not been linked' });
    }

    const user = await prisma.user.findUnique({
        where: { id: linked.userId },
        select: { id: true, username: true, displayName: true, email: true }
    });

    if (!user) {
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    await redis.del(key);

    const token = await signAuthToken(user.id);

    return {
        token,
        user: createAuthUserResponse(user),
        loginMethod: 'luogu-challenge'
    };
});
