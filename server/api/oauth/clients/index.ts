import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { generateClientSecret, setOAuthNoStore } from '~/server/utils/oauth';
import { oauthClientCreateSchema } from '~/server/utils/oauth-request';
import { parseBody } from '~/server/utils/validation';

export default defineEventHandler(async event => {
    setOAuthNoStore(event);
    const userId = getUserIdFromEvent(event);
    const select = {
        id: true,
        clientId: true,
        name: true,
        redirectUris: true,
        requireEmailVerified: true,
        createdAt: true
    } as const;
    if (event.method === 'GET') {
        return prisma.oAuthClient.findMany({
            where: { userId },
            select,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        });
    }
    if (event.method !== 'POST') {
        setHeader(event, 'Allow', 'GET, POST');
        throw createError({ statusCode: 405, message: 'Method not allowed' });
    }
    const draft = await parseBody(event, oauthClientCreateSchema);
    const plainSecret = generateClientSecret();
    const clientSecretHash = await bcrypt.hash(plainSecret, 10);
    try {
        const client = await prisma.oAuthClient.create({
            data: { ...draft, clientSecretHash, userId },
            select
        });
        return { ...client, clientSecret: plainSecret };
    } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === 'P2002') {
            throw createError({
                statusCode: 409,
                message: 'Client creation conflict',
                data: { code: 'CLIENT_CONFLICT' }
            });
        }
        if (code === 'P2003' || code === 'P2025') {
            throw createError({
                statusCode: 404,
                message: 'Account not found',
                data: { code: 'ACCOUNT_NOT_FOUND' }
            });
        }
        throw error;
    }
});
