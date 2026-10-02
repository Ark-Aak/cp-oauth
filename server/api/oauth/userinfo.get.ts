import jwt, { type JwtPayload } from 'jsonwebtoken';
import prisma from '~/server/utils/prisma';
import { hashToken } from '~/server/utils/token-hash';
import { handleOAuthRequest, OAuthProtocolError } from '~/server/utils/oauth';
import { PLATFORM_NAMES } from '~/utils/platforms';
import type { ScopeName } from '~/utils/oauth-scopes';
import {
    fetchClistAccounts,
    fetchClistStatistics,
    filterAccountsByBoundIdentities,
    filterStatisticsByBoundAccounts,
    getResourceDisplayName,
    getEffectiveResource,
    getEffectiveResourceDisplayName,
    type ClistAccount
} from '~/server/utils/clist-api';
import { getValidClistAccessToken } from '~/server/utils/clist-oauth';

export default defineEventHandler(event =>
    handleOAuthRequest(
        event,
        async () => {
            const token = /^Bearer ([^\s]+)$/i.exec(getHeader(event, 'authorization') ?? '')?.[1];
            if (!token)
                throw new OAuthProtocolError('invalid_token', 'A Bearer access token is required');
            let payload: JwtPayload | string;
            try {
                payload = jwt.verify(token, useRuntimeConfig().jwtSecret, {
                    algorithms: ['HS256']
                });
            } catch {
                throw new OAuthProtocolError('invalid_token', 'Invalid or expired access token');
            }
            if (
                typeof payload !== 'object' ||
                payload.type !== 'oauth_access' ||
                typeof payload.sub !== 'string' ||
                !payload.sub ||
                typeof payload.client_id !== 'string' ||
                !payload.client_id ||
                typeof payload.exp !== 'number'
            ) {
                throw new OAuthProtocolError('invalid_token', 'Invalid access token claims');
            }
            const stored = await prisma.oAuthAccessToken.findUnique({
                where: { tokenHash: hashToken(token) },
                select: {
                    userId: true,
                    clientId: true,
                    scopes: true,
                    expiresAt: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            displayName: true,
                            avatarUrl: true,
                            bio: true,
                            email: true,
                            emailVerified: true
                        }
                    }
                }
            });
            if (
                !stored ||
                stored.expiresAt.getTime() <= Date.now() ||
                stored.userId !== payload.sub ||
                stored.clientId !== payload.client_id
            ) {
                throw new OAuthProtocolError('invalid_token', 'Access token is expired or revoked');
            }
            const user = stored.user;
            const scopes = stored.scopes;
            const response: Record<string, unknown> = {};
            const grantedLinkPlatforms = PLATFORM_NAMES.filter(platform =>
                scopes.includes(`link:${platform}` as ScopeName)
            );
            if (scopes.includes('openid')) response.sub = user.id;
            if (scopes.includes('profile')) {
                response.username = user.username;
                response.display_name = user.displayName;
                response.avatar_url = user.avatarUrl;
                response.bio = user.bio;
            }
            if (scopes.includes('email')) {
                response.email = user.email;
                response.email_verified = user.emailVerified;
            }

            const needsCpData = scopes.includes('cp:summary') || scopes.includes('cp:details');
            const wantsAllLinks = scopes.includes('cp:linked');
            const linked =
                needsCpData || wantsAllLinks || grantedLinkPlatforms.length
                    ? await prisma.linkedAccount.findMany({
                          where: {
                              userId: user.id,
                              ...(!needsCpData && !wantsAllLinks
                                  ? { platform: { in: grantedLinkPlatforms } }
                                  : {})
                          },
                          select: {
                              id: true,
                              platform: true,
                              platformUid: true,
                              platformUsername: true
                          }
                      })
                    : [];
            if (wantsAllLinks || grantedLinkPlatforms.length) {
                response.linked_accounts = linked
                    .filter(
                        account =>
                            wantsAllLinks ||
                            grantedLinkPlatforms.includes(
                                account.platform as (typeof PLATFORM_NAMES)[number]
                            )
                    )
                    .map(account => ({
                        platform: account.platform,
                        platformUid: account.platformUid,
                        platformUsername: account.platformUsername
                    }));
            }
            if (grantedLinkPlatforms.length) {
                response.link_scopes = grantedLinkPlatforms.map(platform => `link:${platform}`);
            }

            // OAuth scopes, not public-page privacy switches, authorize these disclosures.
            let accounts: ClistAccount[] | null = null;
            let clistAccessToken: string | null = null;
            let unavailableMessage = 'Link a Clist.by account to enable CP stats';
            if (needsCpData) {
                const clist = linked.find(account => account.platform === 'clist');
                if (clist) {
                    try {
                        clistAccessToken = await getValidClistAccessToken(clist.id);
                        if (clistAccessToken) {
                            accounts = filterAccountsByBoundIdentities(
                                await fetchClistAccounts(clistAccessToken),
                                linked
                            );
                        }
                    } catch {
                        unavailableMessage = 'Failed to fetch data from Clist.by';
                    }
                }
            }
            if (scopes.includes('cp:summary')) {
                if (accounts === null) {
                    response.cp_summary = { available: false, message: unavailableMessage };
                } else {
                    const rated = accounts.filter(account => account.rating !== null);
                    const highest = rated.length
                        ? rated.reduce((best, current) =>
                              (current.rating ?? -Infinity) > (best.rating ?? -Infinity)
                                  ? current
                                  : best
                          )
                        : null;
                    response.cp_summary = {
                        available: true,
                        accounts: accounts.map(account => ({
                            resource: account.resource,
                            resource_name: getResourceDisplayName(account.resource),
                            handle: account.handle,
                            rating: account.rating,
                            n_contests: account.n_contests,
                            resource_rank: account.resource_rank,
                            last_activity: account.last_activity
                        })),
                        highest_rating: highest
                            ? {
                                  resource: highest.resource,
                                  resource_name: getResourceDisplayName(highest.resource),
                                  handle: highest.handle,
                                  rating: highest.rating
                              }
                            : null,
                        total_contests: accounts.reduce(
                            (sum, account) => sum + account.n_contests,
                            0
                        )
                    };
                }
            }
            if (scopes.includes('cp:details')) {
                if (accounts === null || !clistAccessToken) {
                    response.cp_details = {
                        available: false,
                        message:
                            unavailableMessage === 'Link a Clist.by account to enable CP stats'
                                ? 'Link a Clist.by account to enable CP details'
                                : unavailableMessage
                    };
                } else {
                    try {
                        const resources = new Map<number, string>();
                        const validAccountIds = new Set<number>();
                        for (const account of accounts) {
                            resources.set(account.id, account.resource);
                            validAccountIds.add(account.id);
                        }
                        const statistics = accounts.length
                            ? filterStatisticsByBoundAccounts(
                                  await fetchClistStatistics(clistAccessToken, { limit: 200 }),
                                  validAccountIds
                              )
                                  .filter(
                                      stat =>
                                          stat.new_rating !== null && stat.rating_change !== null
                                  )
                                  .slice(0, 200)
                            : [];
                        response.cp_details = {
                            available: true,
                            rating_history: statistics.map(stat => {
                                const resource = getEffectiveResource({
                                    resource: resources.get(stat.account_id),
                                    event: stat.event
                                });
                                return {
                                    resource,
                                    resource_name: getEffectiveResourceDisplayName(resource),
                                    contest_id: stat.contest_id,
                                    event: stat.event,
                                    date: stat.date,
                                    handle: stat.handle,
                                    place: stat.place,
                                    score: stat.score,
                                    old_rating: stat.old_rating,
                                    new_rating: stat.new_rating,
                                    rating_change: stat.rating_change
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
            return response;
        },
        'invalid_token'
    )
);
