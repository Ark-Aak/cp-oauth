import { Prisma } from '@prisma/client';
import { createError } from 'h3';

export function rethrowIdentityMutationError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
            throw createError({
                statusCode: 409,
                message: 'This username, email or platform account is already in use'
            });
        }
        if (error.code === 'P2025' || error.code === 'P2003') {
            throw createError({
                statusCode: 404,
                message: 'The user or linked account no longer exists'
            });
        }
    }
    throw error;
}
