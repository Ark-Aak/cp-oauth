import prisma from '~/server/utils/prisma';
import { parseInput } from '~/server/utils/validation';
import { platformSchema } from '~/utils/validation';
import { requireFreshReauthentication } from '~/server/utils/auth-completion';
import { assertAuthState, lockAuthUser, finishSensitiveMutation } from '~/server/utils/auth';
import { rethrowIdentityMutationError } from '~/server/utils/identity-errors';

export default defineEventHandler(async event => {
    const platform = parseInput(platformSchema, getRouterParam(event, 'platform'));
    const auth = await requireFreshReauthentication(event, 'binding_change');
    await assertAuthState(event, auth);
    try {
        await prisma.$transaction(async tx => {
            await lockAuthUser(tx, auth.userId);
            await assertAuthState(event, auth);
            const linked = await tx.linkedAccount.findUnique({
                where: { userId_platform: { userId: auth.userId, platform } },
                select: { id: true }
            });
            if (!linked)
                throw createError({
                    statusCode: 404,
                    message: 'No linked account found for this platform'
                });
            await tx.linkedAccount.delete({ where: { id: linked.id } });
            const updated = await tx.user.updateMany({
                where: { id: auth.userId, authVersion: auth.authVersion },
                data: { authVersion: { increment: 1 } }
            });
            if (updated.count !== 1)
                throw createError({
                    statusCode: 409,
                    message: 'Your session changed; please authenticate again'
                });
        });
        await finishSensitiveMutation(event, auth.userId, auth.authVersion + 1);
        return { success: true };
    } catch (error) {
        rethrowIdentityMutationError(error);
    }
});
