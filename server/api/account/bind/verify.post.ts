import { consola } from 'consola';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { getPlatformVerifier } from '~/server/utils/platforms';
import { getRedis } from '~/server/utils/redis';
import prisma from '~/server/utils/prisma';
import { deleteRedisKeyIfValue } from '~/server/utils/security';

const logger = consola.withTag('account:bind');

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const body = await readBody(event);
    const { platform, credential } = body;

    if (!platform) {
        throw createError({ statusCode: 400, message: 'Platform is required' });
    }

    const normalizedCredential = typeof credential === 'string' ? credential : '';
    if (platform !== 'atcoder' && !normalizedCredential) {
        throw createError({ statusCode: 400, message: 'Credential is required' });
    }

    const verifier = getPlatformVerifier(platform);
    if (!verifier) {
        throw createError({ statusCode: 400, message: `Unsupported platform: ${platform}` });
    }

    // Retrieve pending bind request from Redis
    const redis = getRedis();
    const key = `bind:${userId}:${platform}`;
    const raw = await redis.get(key);
    if (!raw) {
        logger.warn(
            `Bind verify failed: no pending request for user=${userId}, platform=${platform}`
        );
        throw createError({
            statusCode: 400,
            message: 'No pending bind request found or it has expired'
        });
    }

    const { code, platformUid } = JSON.parse(raw) as {
        code: string;
        platformUid: string;
    };

    // Call platform verifier
    logger.info(`Verifying bind: user=${userId}, platform=${platform}, uid=${platformUid}`);
    const result = await verifier.verify({ platformUid, code, credential: normalizedCredential });

    if (!result.success) {
        logger.warn(
            `Bind verification failed: user=${userId}, platform=${platform}, uid=${platformUid}, error=${result.error}`
        );
        throw createError({
            statusCode: 400,
            message: result.error || 'Verification failed'
        });
    }

    const consumed = await deleteRedisKeyIfValue(key, raw);
    if (!consumed) {
        throw createError({
            statusCode: 400,
            message: 'No pending bind request found or it has expired'
        });
    }

    // Save to database
    const linked = await prisma.linkedAccount.create({
        data: {
            userId,
            platform,
            platformUid: result.platformUid,
            platformUsername: result.platformUsername || null
        }
    });

    logger.success(
        `Account linked: user=${userId}, platform=${platform}, uid=${result.platformUid}, username=${result.platformUsername}`
    );

    return {
        id: linked.id,
        platform: linked.platform,
        platformUid: linked.platformUid,
        platformUsername: linked.platformUsername
    };
});
