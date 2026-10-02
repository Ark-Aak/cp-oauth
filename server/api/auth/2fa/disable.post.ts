import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { assertAuthState, finishSensitiveMutation, lockAuthUser } from '~/server/utils/auth';
import { requireFreshReauthentication } from '~/server/utils/auth-completion';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { parseBody } from '~/server/utils/validation';
import { cancelTwoFactorSetup } from '~/server/utils/two-factor';

export default defineEventHandler(async event => {
    const body = await parseBody(
        event,
        z.object({ reauthToken: z.string().min(1).max(256) }).strict()
    );
    const auth = await requireFreshReauthentication(event, 'mfa_change', body.reauthToken);
    await enforceRateLimit(event, 'challenge', auth.userId);
    const user = await prisma.$transaction(async tx => {
        await lockAuthUser(tx, auth.userId);
        await assertAuthState(event, auth);
        return tx.user.update({
            where: { id: auth.userId, authVersion: auth.authVersion },
            data: {
                twoFactorEnabled: false,
                twoFactorMethod: null,
                totpSecret: null,
                authVersion: { increment: 1 }
            },
            select: { authVersion: true }
        });
    });
    await cancelTwoFactorSetup(event);
    await finishSensitiveMutation(event, auth.userId, user.authVersion);
    return { success: true };
});
