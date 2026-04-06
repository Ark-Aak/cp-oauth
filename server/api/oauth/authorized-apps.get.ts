import { getUserIdFromEvent } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const now = new Date();

    // Get ALL access tokens for this user (including expired ones)
    const accessTokens = await prisma.oAuthAccessToken.findMany({
        where: { userId },
        select: {
            clientId: true,
            scopes: true,
            createdAt: true,
            expiresAt: true,
            client: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    // Get ALL refresh tokens for this user (including revoked/expired)
    const refreshTokens = await prisma.oAuthRefreshToken.findMany({
        where: { userId },
        select: {
            clientId: true,
            scopes: true,
            createdAt: true,
            expiresAt: true,
            revoked: true,
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
        const isActive = t.expiresAt > now;
        const existing = appMap.get(t.clientId);
        if (existing) {
            t.scopes.forEach(s => existing.scopes.add(s));
            if (t.createdAt > existing.latestAuthorizedAt) {
                existing.latestAuthorizedAt = t.createdAt;
            }
            if (isActive) existing.accessTokenCount++;
        } else {
            appMap.set(t.clientId, {
                clientId: t.clientId,
                name: t.client.name,
                scopes: new Set(t.scopes),
                latestAuthorizedAt: t.createdAt,
                accessTokenCount: isActive ? 1 : 0,
                refreshTokenCount: 0
            });
        }
    }

    for (const t of refreshTokens) {
        const isActive = !t.revoked && t.expiresAt > now;
        const existing = appMap.get(t.clientId);
        if (existing) {
            t.scopes.forEach(s => existing.scopes.add(s));
            if (t.createdAt > existing.latestAuthorizedAt) {
                existing.latestAuthorizedAt = t.createdAt;
            }
            if (isActive) existing.refreshTokenCount++;
        } else {
            appMap.set(t.clientId, {
                clientId: t.clientId,
                name: t.client.name,
                scopes: new Set(t.scopes),
                latestAuthorizedAt: t.createdAt,
                accessTokenCount: 0,
                refreshTokenCount: isActive ? 1 : 0
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
