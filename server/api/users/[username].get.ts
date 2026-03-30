import prisma from '~/server/utils/prisma';
import {
    fetchClistAccounts,
    fetchClistStatistics,
    filterAccountsByBoundPlatforms,
    filterStatisticsByBoundAccounts,
    getResourceDisplayName,
    getEffectiveResource,
    getEffectiveResourceDisplayName
} from '~/server/utils/clist-api';
import { getValidClistAccessToken } from '~/server/utils/clist-oauth';

export default defineEventHandler(async event => {
    const username = getRouterParam(event, 'username');
    if (!username) {
        throw createError({ statusCode: 400, message: 'Username required' });
    }

    const user = await prisma.user.findUnique({
        where: { username },
        select: {
            id: true,
            username: true,
            displayName: true,
            bio: true,
            homepage: true,
            avatarUrl: true,
            createdAt: true,
            publicLinkedPlatforms: true,
            publicLinkedPlatformsConfigured: true,
            publicCpStats: true,
            publicRatingHistory: true,
            linkedAccounts: {
                select: {
                    id: true,
                    platform: true,
                    platformUid: true,
                    platformUsername: true,
                    oauthAccessToken: true
                },
                orderBy: { createdAt: 'asc' }
            }
        }
    });

    if (!user) {
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    const linkedAccounts = user.publicLinkedPlatformsConfigured
        ? user.linkedAccounts.filter(account => {
              return user.publicLinkedPlatforms.includes(account.platform);
          })
        : user.linkedAccounts;

    // Strip oauthAccessToken from public response
    const publicLinkedAccounts = linkedAccounts.map(
        ({ oauthAccessToken: _, id: _id, ...rest }) => rest
    );

    // Determine Clist access — use refresh-aware token getter
    const clistAccount = user.linkedAccounts.find(a => a.platform === 'clist');
    let clistToken: string | null = null;
    if (clistAccount) {
        clistToken = await getValidClistAccessToken(clistAccount.id);
    }
    const publicPlatforms = linkedAccounts.map(a => a.platform).filter(p => p !== 'clist');

    // Fetch CP stats from Clist.by if user opted in
    let cpStats = null;
    if (user.publicCpStats && clistToken) {
        try {
            const allAccounts = await fetchClistAccounts(clistToken);
            const filtered = filterAccountsByBoundPlatforms(allAccounts, publicPlatforms);

            const ratedAccounts = filtered.filter(a => a.rating !== null && a.rating !== undefined);
            const highest =
                ratedAccounts.length > 0
                    ? ratedAccounts.reduce((best, cur) =>
                          (cur.rating || 0) > (best.rating || 0) ? cur : best
                      )
                    : null;

            cpStats = {
                accounts: filtered.map(a => ({
                    resource: a.resource,
                    resource_name: getResourceDisplayName(a.resource),
                    handle: a.handle,
                    rating: a.rating,
                    n_contests: a.n_contests,
                    resource_rank: a.resource_rank,
                    last_activity: a.last_activity
                })),
                highest_rating: highest
                    ? {
                          resource: highest.resource,
                          resource_name: getResourceDisplayName(highest.resource),
                          handle: highest.handle,
                          rating: highest.rating
                      }
                    : null,
                total_contests: filtered.reduce((sum, a) => sum + (a.n_contests || 0), 0)
            };
        } catch {
            // Clist API failed — silently skip
        }
    }

    // Fetch rating history from Clist.by if user opted in
    let ratingHistory = null;
    if (user.publicRatingHistory && clistToken) {
        try {
            const allAccounts = await fetchClistAccounts(clistToken);
            const filtered = filterAccountsByBoundPlatforms(allAccounts, publicPlatforms);
            const validAccountIds = new Set(filtered.map(a => a.id));

            const allStats = await fetchClistStatistics(clistToken, { limit: 500 });

            // Debug: log raw stats info
            const { consola } = await import('consola');
            const dbgLogger = consola.withTag('user-profile:rating');
            dbgLogger.info(
                `ratingHistory debug: publicRatingHistory=${user.publicRatingHistory}, ` +
                    `clistToken=${clistToken ? 'present' : 'missing'}, ` +
                    `allAccounts=${allAccounts.length}, filtered=${filtered.length}, ` +
                    `validAccountIds=[${[...validAccountIds].join(',')}], ` +
                    `allStats=${allStats.length}, ` +
                    `statsWithRating=${allStats.filter(s => s.new_rating !== null).length}`
            );

            const stats = filterStatisticsByBoundAccounts(allStats, validAccountIds);

            // Build account id → resource mapping for the frontend
            const accountResourceMap: Record<number, string> = {};
            for (const a of filtered) {
                accountResourceMap[a.id] = a.resource;
            }

            ratingHistory = stats
                .filter(s => s.new_rating !== null)
                .map(s => {
                    const rawResource = accountResourceMap[s.account_id] || '';
                    const effective = getEffectiveResource({
                        resource: rawResource,
                        event: s.event
                    });
                    return {
                        resource: effective,
                        resource_name: getEffectiveResourceDisplayName(effective),
                        contest_id: s.contest_id,
                        event: s.event,
                        date: s.date,
                        handle: s.handle,
                        place: s.place,
                        old_rating: s.old_rating,
                        new_rating: s.new_rating,
                        rating_change: s.rating_change
                    };
                });
        } catch {
            // Clist API failed — silently skip
        }
    }

    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        homepage: user.homepage,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        linkedAccounts: publicLinkedAccounts,
        ...(cpStats ? { cpStats } : {}),
        ...(ratingHistory ? { ratingHistory } : {})
    };
});
