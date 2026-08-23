import { consola } from 'consola';
import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { generateClientSecret, normalizeOAuthRedirectUris } from '~/server/utils/oauth';

const logger = consola.withTag('oauth:clients');

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);

    if (event.method === 'GET') {
        const clients = await prisma.oAuthClient.findMany({
            where: { userId },
            select: {
                id: true,
                clientId: true,
                name: true,
                redirectUris: true,
                requireEmailVerified: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
        logger.debug(`Listed ${clients.length} clients for user ${userId}`);
        return clients;
    }

    if (event.method === 'POST') {
        const body = await readBody(event);
        const { name, redirectUris, requireEmailVerified } = body;
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedRedirectUris = normalizeOAuthRedirectUris(redirectUris);

        if (!normalizedName) {
            throw createError({ statusCode: 400, message: 'name must be a non-empty string' });
        }

        if (!normalizedRedirectUris) {
            throw createError({
                statusCode: 400,
                message: 'redirectUris must contain at least one valid http(s) URL'
            });
        }

        if (requireEmailVerified !== undefined && typeof requireEmailVerified !== 'boolean') {
            throw createError({
                statusCode: 400,
                message: 'requireEmailVerified must be a boolean'
            });
        }

        const plainSecret = generateClientSecret();
        const clientSecretHash = await bcrypt.hash(plainSecret, 10);

        const client = await prisma.oAuthClient.create({
            data: {
                name: normalizedName,
                redirectUris: normalizedRedirectUris,
                requireEmailVerified: requireEmailVerified ?? false,
                clientSecretHash,
                userId
            },
            select: {
                id: true,
                clientId: true,
                name: true,
                redirectUris: true,
                requireEmailVerified: true,
                createdAt: true
            }
        });

        logger.success(
            `Client created: "${normalizedName}" (${client.clientId}) by user ${userId}`
        );

        // Return plain secret only once at creation
        return { ...client, clientSecret: plainSecret };
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
