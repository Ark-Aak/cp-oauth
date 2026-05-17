import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { getRedis } from '~/server/utils/redis';
import { getConfig } from '~/server/utils/config';
import { canRefreshUsername, fetchPlatformUsername } from '~/server/utils/platform-username';
import { getValidClistAccessToken } from '~/server/utils/clist-oauth';

interface RefreshBody {
    platform?: string;
    platformUid?: string;
}

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);

    const body = await readBody<RefreshBody>(event);

    if (!body.platform || !body.platformUid) {
        throw createError({ statusCode: 400, message: 'Missing platform or platformUid' });
    }

    const { platform, platformUid } = body;

    if (!canRefreshUsername(platform)) {
        throw createError({
            statusCode: 400,
            message: `Username refresh is not supported for platform: ${platform}`
        });
    }

    const account = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: { platform, platformUid }
        },
        select: {
            id: true,
            userId: true,
            platformUsername: true,
            oauthAccessToken: true,
            oauthIdToken: true,
            oauthTokenType: true
        }
    });

    if (!account) {
        throw createError({ statusCode: 404, message: 'Linked account not found' });
    }

    if (account.userId !== userId) {
        throw createError({ statusCode: 403, message: 'Forbidden' });
    }

    const redis = getRedis();
    const cooldownLockKey = `refresh-username:${platform}:${platformUid}`;
    let acquiredCooldownLock = false;

    try {
        const cooldownMinutes = parseInt(await getConfig('username_refresh_cooldown'), 10) || 1440;
        const cooldownSeconds = cooldownMinutes * 60;
        const lockResult = await redis.set(cooldownLockKey, '1', 'EX', cooldownSeconds, 'NX');
        if (lockResult !== 'OK') {
            const ttl = await redis.ttl(cooldownLockKey);
            const remainingMinutes = Math.ceil(Math.max(ttl, 1) / 60);
            throw createError({
                statusCode: 429,
                message: `Please wait ${remainingMinutes} minute(s) before refreshing again`
            });
        }
        acquiredCooldownLock = true;
    } catch (e: unknown) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 429) throw e;
    }

    try {
        // For Clist platform, use refresh-aware token getter
        let effectiveAccessToken = account.oauthAccessToken;
        if (platform === 'clist') {
            const refreshed = await getValidClistAccessToken(account.id);
            if (refreshed) {
                effectiveAccessToken = refreshed;
            }
        }

        const newUsername = await fetchPlatformUsername(platform, {
            platformUid,
            oauthAccessToken: effectiveAccessToken,
            oauthIdToken: account.oauthIdToken,
            oauthTokenType: account.oauthTokenType
        });

        if (!newUsername) {
            if (platform === 'github' && !account.oauthAccessToken) {
                throw createError({
                    statusCode: 409,
                    message:
                        'Unable to refresh GitHub username because no GitHub access token has been saved. Please sign in with GitHub again to sync credentials.'
                });
            }

            if (platform === 'codeforces') {
                throw createError({
                    statusCode: 409,
                    message:
                        'Unable to refresh Codeforces username. Please unbind and bind Codeforces again to update OAuth credentials.'
                });
            }

            if (platform === 'github') {
                throw createError({
                    statusCode: 502,
                    message: 'Failed to refresh GitHub username from GitHub API'
                });
            }

            throw createError({
                statusCode: 502,
                message: 'Failed to fetch username from platform'
            });
        }

        await prisma.linkedAccount.update({
            where: {
                platform_platformUid: { platform, platformUid }
            },
            data: { platformUsername: newUsername }
        });

        return {
            platform,
            platformUid,
            platformUsername: newUsername
        };
    } catch (error) {
        if (acquiredCooldownLock) {
            await redis.del(cooldownLockKey);
        }
        throw error;
    }
});
