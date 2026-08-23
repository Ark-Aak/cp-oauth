import { consola } from 'consola';
import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { normalizeOAuthRedirectUris } from '~/server/utils/oauth';

const logger = consola.withTag('oauth:clients');

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const id = getRouterParam(event, 'id');

    if (!id) {
        throw createError({ statusCode: 400, message: 'Client ID required' });
    }

    const client = await prisma.oAuthClient.findUnique({ where: { id } });
    if (!client || client.userId !== userId) {
        logger.warn(`Edit rejected: client id=${id} not found or not owned by user ${userId}`);
        throw createError({ statusCode: 404, message: 'Client not found' });
    }

    const body = await readBody(event);
    const { name, redirectUris, requireEmailVerified } = body;

    const data: Record<string, unknown> = {};

    if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
            throw createError({ statusCode: 400, message: 'name must be a non-empty string' });
        }
        data.name = name.trim();
    }

    if (redirectUris !== undefined) {
        const normalizedRedirectUris = normalizeOAuthRedirectUris(redirectUris);
        if (!normalizedRedirectUris) {
            throw createError({
                statusCode: 400,
                message: 'redirectUris must contain at least one valid http(s) URL'
            });
        }
        data.redirectUris = normalizedRedirectUris;
    }

    if (requireEmailVerified !== undefined) {
        if (typeof requireEmailVerified !== 'boolean') {
            throw createError({
                statusCode: 400,
                message: 'requireEmailVerified must be a boolean'
            });
        }
        data.requireEmailVerified = requireEmailVerified;
    }

    if (Object.keys(data).length === 0) {
        throw createError({ statusCode: 400, message: 'No fields to update' });
    }

    const updated = await prisma.oAuthClient.update({
        where: { id },
        data,
        select: {
            id: true,
            clientId: true,
            name: true,
            redirectUris: true,
            requireEmailVerified: true,
            createdAt: true
        }
    });

    logger.success(`Client updated: "${updated.name}" (${updated.clientId}) by user ${userId}`);

    return updated;
});
