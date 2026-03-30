import { consola } from 'consola';
import jwt from 'jsonwebtoken';
import prisma from '~/server/utils/prisma';
import type { ScopeName } from '~/server/utils/oauth';
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

const logger = consola.withTag('oauth:userinfo');

interface OAuthPayload {
    sub: string;
    client_id: string;
    scopes: string[];
    type: string;
}

const LINK_SCOPE_PLATFORMS = [
    'luogu',
    'atcoder',
    'codeforces',
    'github',
    'google',
    'clist'
] as const;

export default defineEventHandler(async event => {
    const auth = getHeader(event, 'authorization');
    if (!auth?.startsWith('Bearer ')) {
        logger.warn('Rejected: missing Bearer token');
        throw createError({ statusCode: 401, message: 'Bearer token required' });
    }

    const token = auth.slice(7);
    const config = useRuntimeConfig();

    let payload: OAuthPayload;
    try {
        payload = jwt.verify(token, config.jwtSecret) as OAuthPayload;
    } catch {
        logger.warn('Rejected: invalid or expired access token');
        throw createError({ statusCode: 401, message: 'Invalid or expired token' });
    }

    if (payload.type !== 'oauth_access') {
        logger.warn(`Rejected: wrong token type="${payload.type}" for userinfo`);
        throw createError({ statusCode: 401, message: 'Invalid token type' });
    }

    // Verify token still exists in DB (not revoked)
    const storedToken = await prisma.oAuthAccessToken.findUnique({ where: { token } });
    if (!storedToken || storedToken.expiresAt < new Date()) {
        logger.warn(
            `Rejected: token expired or revoked for user=${payload.sub}, client_id=${payload.client_id}`
        );
        throw createError({ statusCode: 401, message: 'Token expired or revoked' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
        logger.error(`User not found: sub=${payload.sub}, client_id=${payload.client_id}`);
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    const scopes = payload.scopes as ScopeName[];
    const response: Record<string, unknown> = {};
    const grantedLinkPlatforms = LINK_SCOPE_PLATFORMS.filter(platform =>
        scopes.includes(`link:${platform}` as ScopeName)
    );

    // openid — always include sub
    if (scopes.includes('openid')) {
        response.sub = user.id;
    }

    // profile — username, avatar, bio, displayName
    if (scopes.includes('profile')) {
        response.username = user.username;
        response.display_name = user.displayName;
        response.avatar_url = user.avatarUrl;
        response.bio = user.bio;
    }

    // email — email address and verification status
    if (scopes.includes('email')) {
        response.email = user.email;
        response.email_verified = user.emailVerified;
    }

    // cp:linked — linked platform accounts
    if (scopes.includes('cp:linked') || grantedLinkPlatforms.length > 0) {
        const linked = await prisma.linkedAccount.findMany({
            where: {
                userId: user.id,
                ...(scopes.includes('cp:linked')
                    ? {}
                    : {
                          platform: {
                              in: grantedLinkPlatforms
                          }
                      })
            },
            select: {
                platform: true,
                platformUid: true,
                platformUsername: true
            }
        });
        response.linked_accounts = linked;
    }

    // link:{platform} — expose which per-platform link scopes are granted
    if (grantedLinkPlatforms.length > 0) {
        response.link_scopes = grantedLinkPlatforms.map(platform => `link:${platform}`);
    }

    // cp:summary and cp:details — fetch real data from Clist.by
    const needsCpData = scopes.includes('cp:summary') || scopes.includes('cp:details');
    let clistAccessToken: string | null = null;
    let boundPlatforms: string[] = [];

    if (needsCpData) {
        const clistLinked = await prisma.linkedAccount.findUnique({
            where: { userId_platform: { userId: user.id, platform: 'clist' } },
            select: { id: true }
        });

        if (clistLinked) {
            clistAccessToken = await getValidClistAccessToken(clistLinked.id);
        }

        if (clistAccessToken) {
            const allLinked = await prisma.linkedAccount.findMany({
                where: { userId: user.id, platform: { not: 'clist' } },
                select: { platform: true }
            });
            boundPlatforms = allLinked.map(a => a.platform);
        }
    }

    // cp:summary — aggregated CP stats from Clist.by
    if (scopes.includes('cp:summary')) {
        if (!clistAccessToken) {
            response.cp_summary = {
                available: false,
                message: 'Link a Clist.by account to enable CP stats'
            };
        } else {
            try {
                const allAccounts = await fetchClistAccounts(clistAccessToken);
                const accounts = filterAccountsByBoundPlatforms(allAccounts, boundPlatforms);

                const ratedAccounts = accounts.filter(
                    a => a.rating !== null && a.rating !== undefined
                );
                const highest =
                    ratedAccounts.length > 0
                        ? ratedAccounts.reduce((best, cur) =>
                              (cur.rating || 0) > (best.rating || 0) ? cur : best
                          )
                        : null;
                const totalContests = accounts.reduce((sum, a) => sum + (a.n_contests || 0), 0);

                response.cp_summary = {
                    available: true,
                    accounts: accounts.map(a => ({
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
                    total_contests: totalContests
                };
            } catch {
                response.cp_summary = {
                    available: false,
                    message: 'Failed to fetch data from Clist.by'
                };
            }
        }
    }

    // cp:details — rating history from Clist.by
    if (scopes.includes('cp:details')) {
        if (!clistAccessToken) {
            response.cp_details = {
                available: false,
                message: 'Link a Clist.by account to enable CP details'
            };
        } else {
            try {
                const allAccounts = await fetchClistAccounts(clistAccessToken);
                const filteredAccounts = filterAccountsByBoundPlatforms(
                    allAccounts,
                    boundPlatforms
                );
                const validAccountIds = new Set(filteredAccounts.map(a => a.id));

                const allStats = await fetchClistStatistics(clistAccessToken, {
                    limit: 200
                });
                const stats = filterStatisticsByBoundAccounts(allStats, validAccountIds);

                // Build account id → resource mapping
                const accountResourceMap: Record<number, string> = {};
                for (const a of filteredAccounts) {
                    accountResourceMap[a.id] = a.resource;
                }

                response.cp_details = {
                    available: true,
                    rating_history: stats.map(s => {
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
                            score: s.score,
                            old_rating: s.old_rating,
                            new_rating: s.new_rating,
                            rating_change: s.rating_change
                        };
                    })
                };
            } catch {
                response.cp_details = {
                    available: false,
                    message: 'Failed to fetch data from Clist.by'
                };
            }
        }
    }

    logger.info(
        `Userinfo served: user=${user.username} (${user.id}), client_id=${payload.client_id}, scopes=[${scopes.join(', ')}]`
    );

    return response;
});
