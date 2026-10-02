import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { getAuthContext, assertAuthState, lockAuthUser } from '~/server/utils/auth';
import { getRedis } from '~/server/utils/redis';
import { getConfig } from '~/server/utils/config';
import { canRefreshUsername, fetchPlatformUsername } from '~/server/utils/platform-username';
import { getValidClistAccessToken } from '~/server/utils/clist-oauth';
import { decryptLinkedAccountToken } from '~/server/utils/linked-account-tokens';
import { deleteRedisKeyIfValue } from '~/server/utils/security';
import { parseBody } from '~/server/utils/validation';
import { platformSchema } from '~/utils/validation';

const refreshSchema = z.strictObject({
    platform: platformSchema,
    platformUid: z.string().trim().min(1).max(100)
});

export default defineEventHandler(async event => {
    const auth = getAuthContext(event);
    const body = await parseBody(event, refreshSchema);
    if (!canRefreshUsername(body.platform))
        throw createError({
            statusCode: 400,
            message: 'Username refresh is not supported for this platform'
        });
    const account = await prisma.linkedAccount.findUnique({
        where: { userId_platform: { userId: auth.userId, platform: body.platform } },
        select: { id: true, platformUid: true, platformUsername: true, oauthAccessToken: true }
    });
    if (!account || account.platformUid !== body.platformUid)
        throw createError({ statusCode: 404, message: 'Your linked account was not found' });
    await assertAuthState(event, auth);
    const { username_refresh_cooldown } = await getConfig(['username_refresh_cooldown']);
    const cooldownMinutes = Number(username_refresh_cooldown);
    if (!Number.isInteger(cooldownMinutes) || cooldownMinutes < 1 || cooldownMinutes > 43200) {
        throw createError({
            statusCode: 503,
            message: 'Username refresh configuration is unavailable'
        });
    }
    const key = `cp-oauth:v2:account:refresh-username:${account.id}`;
    const owner = randomBytes(32).toString('base64url');
    let acquired: string | null;
    let remainingSeconds: number;
    try {
        acquired = await getRedis().set(key, owner, 'EX', cooldownMinutes * 60, 'NX');
        remainingSeconds = acquired === 'OK' ? 0 : Math.max(await getRedis().ttl(key), 1);
    } catch {
        throw createError({ statusCode: 503, message: 'Username refresh cooldown is unavailable' });
    }
    if (acquired !== 'OK') {
        setResponseHeader(event, 'Retry-After', remainingSeconds);
        throw createError({
            statusCode: 429,
            message: `Please wait ${Math.ceil(remainingSeconds / 60)} minute(s) before refreshing again`,
            data: { code: 'USERNAME_REFRESH_COOLDOWN', retryAfter: remainingSeconds }
        });
    }
    try {
        const accessToken =
            body.platform === 'clist'
                ? await getValidClistAccessToken(account.id)
                : body.platform === 'github'
                  ? decryptLinkedAccountToken(
                        account.id,
                        'oauthAccessToken',
                        account.oauthAccessToken
                    )
                  : null;
        const platformUsername = await fetchPlatformUsername(body.platform, {
            platformUid: account.platformUid,
            platformUsername: account.platformUsername,
            oauthAccessToken: accessToken
        });
        if (!platformUsername)
            throw createError({
                statusCode: 404,
                message: 'Platform account was not found; the previous username has been kept'
            });
        await prisma.$transaction(async tx => {
            await lockAuthUser(tx, auth.userId);
            await assertAuthState(event, auth);
            const updated = await tx.linkedAccount.updateMany({
                where: {
                    id: account.id,
                    userId: auth.userId,
                    platformUid: account.platformUid,
                    platformUsername: account.platformUsername
                },
                data: { platformUsername }
            });
            if (updated.count !== 1)
                throw createError({
                    statusCode: 409,
                    message: 'Account binding changed; please reload and try again'
                });
        });
        return { platform: body.platform, platformUid: account.platformUid, platformUsername };
    } catch (error) {
        try {
            await deleteRedisKeyIfValue(key, owner);
        } catch {
            // A failed refresh never overwrites the old username; an unreleased cooldown is bounded.
        }
        throw error;
    }
});
