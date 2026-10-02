import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { assertAuthState, finishSensitiveMutation, lockAuthUser } from '~/server/utils/auth';
import { requireFreshReauthentication } from '~/server/utils/auth-completion';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { parseInput } from '~/server/utils/validation';

export default defineEventHandler(async event => {
    const id = parseInput(z.string().min(1).max(128), getRouterParam(event, 'id'));
    const auth = await requireFreshReauthentication(event, 'passkey_delete');
    await enforceRateLimit(event, 'challenge', auth.userId);
    const user = await prisma.$transaction(async tx => {
        await lockAuthUser(tx, auth.userId);
        await assertAuthState(event, auth);
        const deleted = await tx.passkeyCredential.deleteMany({
            where: { id, userId: auth.userId }
        });
        if (deleted.count !== 1)
            throw createError({ statusCode: 404, message: 'Passkey not found' });
        return tx.user.update({
            where: { id: auth.userId, authVersion: auth.authVersion },
            data: { authVersion: { increment: 1 } },
            select: { authVersion: true }
        });
    });
    await finishSensitiveMutation(event, auth.userId, user.authVersion);
    return { success: true };
});
