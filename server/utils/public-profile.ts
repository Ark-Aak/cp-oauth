import { createError } from 'h3';
import prisma from './prisma';
import { getValidClistAccessToken } from './clist-oauth';
import {
    fetchClistAccounts,
    fetchClistStatistics,
    filterAccountsByBoundIdentities,
    filterStatisticsByBoundAccounts,
    getResourceDisplayName,
    getEffectiveResource,
    getEffectiveResourceDisplayName,
    isMatchableBoundIdentity
} from './clist-api';
import type { ClistAccount } from './clist-api';
import { isPlatform } from '~/utils/platforms';
import { normalizeUsername } from '~/utils/username';
import type { CpStats, PublicProfileResponse, PublicProfileStats } from '~/types/public-profile';
import type { PublicLinkedAccount } from '~/types/api';

export interface PublicProfileData {
    profile: PublicProfileResponse;
    clistAccountId: string | null;
}

/** The base query deliberately never loads any external OAuth credentials. */
export async function getPublicProfile(username: string): Promise<PublicProfileData> {
    const user = await prisma.user.findUnique({
        where: { username: normalizeUsername(username) },
        select: {
            id: true,
            username: true,
            displayName: true,
            bio: true,
            homepage: true,
            avatarUrl: true,
            createdAt: true,
            publicLinkedPlatforms: true,
            publicCpStats: true,
            publicRatingHistory: true,
            linkedAccounts: {
                select: { id: true, platform: true, platformUid: true, platformUsername: true },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
            }
        }
    });
    if (!user) throw createError({ statusCode: 404, message: 'User not found' });
    const linkedAccounts: PublicLinkedAccount[] = [];
    for (const account of user.linkedAccounts) {
        if (user.publicLinkedPlatforms.includes(account.platform) && isPlatform(account.platform)) {
            linkedAccounts.push({
                platform: account.platform,
                platformUid: account.platformUid,
                platformUsername: account.platformUsername
            });
        }
    }
    return {
        profile: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            bio: user.bio,
            homepage: user.homepage,
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt.toISOString(),
            linkedAccounts,
            publicCpStats: user.publicCpStats,
            publicRatingHistory: user.publicRatingHistory
        },
        clistAccountId:
            user.linkedAccounts.find(account => account.platform === 'clist')?.id ?? null
    };
}

export async function getPublicProfileStats(data: PublicProfileData): Promise<PublicProfileStats> {
    const { profile, clistAccountId } = data;
    const result: PublicProfileStats = {};
    if (!profile.publicCpStats && !profile.publicRatingHistory) return result;

    // With no publicly matchable identity there is known to be no disclosable data.
    if (!profile.linkedAccounts.some(isMatchableBoundIdentity)) {
        if (profile.publicCpStats) {
            result.cpStatsStatus = 'available';
            result.cpStats = { accounts: [], highest_rating: null, total_contests: 0 };
        }
        if (profile.publicRatingHistory) {
            result.ratingHistoryStatus = 'available';
            result.ratingHistory = [];
        }
        return result;
    }
    if (profile.publicCpStats) result.cpStatsStatus = 'unavailable';
    if (profile.publicRatingHistory) result.ratingHistoryStatus = 'unavailable';
    if (!clistAccountId) return result;

    let token: string | null;
    let accounts: ClistAccount[];
    try {
        token = await getValidClistAccessToken(clistAccountId);
        if (!token) return result;
        accounts = filterAccountsByBoundIdentities(
            await fetchClistAccounts(token),
            profile.linkedAccounts
        );
    } catch {
        return result;
    }

    if (profile.publicCpStats) {
        let highest: CpStats['highest_rating'] = null;
        let totalContests = 0;
        const summaryAccounts = accounts.map(account => {
            const resourceName = getResourceDisplayName(account.resource);
            if (account.rating !== null && (!highest || account.rating > highest.rating)) {
                highest = {
                    resource: account.resource,
                    resource_name: resourceName,
                    handle: account.handle,
                    rating: account.rating
                };
            }
            totalContests += account.n_contests;
            return {
                resource: account.resource,
                resource_name: resourceName,
                handle: account.handle,
                rating: account.rating,
                n_contests: account.n_contests,
                resource_rank: account.resource_rank,
                last_activity: account.last_activity
            };
        });
        result.cpStatsStatus = 'available';
        result.cpStats = {
            accounts: summaryAccounts,
            highest_rating: highest,
            total_contests: totalContests
        };
    }
    if (profile.publicRatingHistory) {
        if (accounts.length === 0) {
            result.ratingHistoryStatus = 'available';
            result.ratingHistory = [];
            return result;
        }
        try {
            const resourceByAccount = new Map(
                accounts.map(account => [account.id, account.resource])
            );
            const statistics = filterStatisticsByBoundAccounts(
                await fetchClistStatistics(token, { limit: 500 }),
                new Set(resourceByAccount.keys())
            );
            result.ratingHistory = statistics
                .filter(
                    statistic => statistic.new_rating !== null && statistic.rating_change !== null
                )
                .map(statistic => {
                    const resource = getEffectiveResource({
                        resource: resourceByAccount.get(statistic.account_id),
                        event: statistic.event
                    });
                    return {
                        resource,
                        resource_name: getEffectiveResourceDisplayName(resource),
                        contest_id: statistic.contest_id,
                        event: statistic.event,
                        date: statistic.date,
                        handle: statistic.handle,
                        place: statistic.place,
                        old_rating: statistic.old_rating,
                        new_rating: statistic.new_rating,
                        rating_change: statistic.rating_change
                    };
                });
            result.ratingHistoryStatus = 'available';
        } catch {
            // A history outage must not discard a successfully fetched summary.
        }
    }
    return result;
}
