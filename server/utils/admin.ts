import { Prisma } from '@prisma/client';
import { createError, isError, type H3Event } from 'h3';
import prisma from '~/server/utils/prisma';
import { getUserIdFromEvent, type AuthContext } from '~/server/utils/auth';

export async function requireAdmin(event: H3Event): Promise<string> {
    const userId = getUserIdFromEvent(event);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true }
    });

    if (!user || user.role !== 'admin') {
        throw createError({ statusCode: 403, message: 'Admin access required' });
    }

    return userId;
}

export async function requireAdminInTransaction(
    tx: Prisma.TransactionClient,
    auth: AuthContext
): Promise<void> {
    const actor = await tx.user.findUnique({
        where: { id: auth.userId },
        select: { role: true, authVersion: true }
    });
    if (!actor || actor.role !== 'admin') {
        throw createError({ statusCode: 403, message: 'Admin access required' });
    }
    if (actor.authVersion !== auth.authVersion) {
        throw createError({
            statusCode: 401,
            message: 'Authentication state has changed',
            data: { code: 'AUTH_STATE_CHANGED' }
        });
    }
}

export async function requireAnotherAdmin(tx: Prisma.TransactionClient): Promise<void> {
    if ((await tx.user.count({ where: { role: 'admin' } })) <= 1) {
        throw createError({
            statusCode: 409,
            message: 'Cannot remove the last admin',
            data: { code: 'LAST_ADMIN' }
        });
    }
}

export function rethrowAdminError(error: unknown, resource = 'Resource'): never {
    if (isError(error)) {
        error.stack = '';
        throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025' || error.code === 'P2003') {
            throw createError({ statusCode: 404, message: `${resource} not found`, stack: '' });
        }
        if (error.code === 'P2002' || error.code === 'P2034') {
            throw createError({
                statusCode: 409,
                message: 'The requested change conflicts with current data',
                stack: ''
            });
        }
    }
    throw createError({
        statusCode: 503,
        message: 'Administration is temporarily unavailable',
        data: { code: 'ADMIN_UNAVAILABLE' },
        stack: ''
    });
}
