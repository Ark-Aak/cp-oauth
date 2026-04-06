import { getUserIdFromEvent } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);

    // Get all active access tokens grouped by client
    const accessTokens = await prisma.oAuthAccessToken.findMany({
        where: { userId, expiresAt: { gt: new Date() } },
        select: {
            clientId: true,
            scopes: true,
            createdAt: true,
            client: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    // Get all active (non-revoked, non-expired) refresh tokens grouped by client
    const refreshTokens = await prisma.oAuthRefreshToken.findMany({
        where: { userId, revoked: false, expiresAt: { gt: new Date() } },
        select: {
            clientId: true,
            scopes: true,
            createdAt: true,
            client: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    // Merge and group by clientId
    const appMap = new Map<
        string,
        {
            clientId: string;
            name: string;
            scopes: Set<string>;
            latestAuthorizedAt: Date;
            accessTokenCount: number;
            refreshTokenCount: number;
        }
    >();

    for (const t of accessTokens) {
        const existing = appMap.get(t.clientId);
        if (existing) {
            t.scopes.forEach(s => existing.scopes.add(s));
            if (t.createdAt > existing.latestAuthorizedAt) {
                existing.latestAuthorizedAt = t.createdAt;
            }
            existing.accessTokenCount++;
        } else {
            appMap.set(t.clientId, {
                clientId: t.clientId,
                name: t.client.name,
                scopes: new Set(t.scopes),
                latestAuthorizedAt: t.createdAt,
                accessTokenCount: 1,
                refreshTokenCount: 0
            });
        }
    }

    for (const t of refreshTokens) {
        const existing = appMap.get(t.clientId);
        if (existing) {
            t.scopes.forEach(s => existing.scopes.add(s));
            if (t.createdAt > existing.latestAuthorizedAt) {
                existing.latestAuthorizedAt = t.createdAt;
            }
            existing.refreshTokenCount++;
        } else {
            appMap.set(t.clientId, {
                clientId: t.clientId,
                name: t.client.name,
                scopes: new Set(t.scopes),
                latestAuthorizedAt: t.createdAt,
                accessTokenCount: 0,
                refreshTokenCount: 1
            });
        }
    }

    return Array.from(appMap.values()).map(app => ({
        clientId: app.clientId,
        name: app.name,
        scopes: Array.from(app.scopes).sort(),
        latestAuthorizedAt: app.latestAuthorizedAt.toISOString(),
        accessTokenCount: app.accessTokenCount,
        refreshTokenCount: app.refreshTokenCount
    }));
});
