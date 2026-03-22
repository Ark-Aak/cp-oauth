import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { generateClientSecret } from '~/server/utils/oauth';

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
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
        return clients;
    }

    if (event.method === 'POST') {
        const body = await readBody(event);
        const { name, redirectUris } = body;

        if (!name || !redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
            throw createError({ statusCode: 400, message: 'name and redirectUris are required' });
        }

        const plainSecret = generateClientSecret();
        const clientSecretHash = await bcrypt.hash(plainSecret, 10);

        const client = await prisma.oAuthClient.create({
            data: {
                name,
                redirectUris,
                clientSecretHash,
                userId
            },
            select: {
                id: true,
                clientId: true,
                name: true,
                redirectUris: true,
                createdAt: true
            }
        });

        // Return plain secret only once at creation
        return { ...client, clientSecret: plainSecret };
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
