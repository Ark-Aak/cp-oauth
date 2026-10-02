import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import prisma from '~/server/utils/prisma';
import { parseBody } from '~/server/utils/validation';
import { assertAuthState, lockAuthUser, finishSensitiveMutation } from '~/server/utils/auth';
import {
    platformChallengeIdSchema,
    readPlatformChallenge,
    verifyPlatformChallenge,
    consumePlatformChallenge
} from '~/server/utils/platform-flow';
import { rethrowIdentityMutationError } from '~/server/utils/identity-errors';

const verifySchema = z.strictObject({
    requestId: platformChallengeIdSchema,
    credential: z.string().trim().max(2048).default('')
});

export default defineEventHandler(async event => {
    const body = await parseBody(event, verifySchema);
    const pending = await readPlatformChallenge(event, body.requestId, { mode: 'bind' });
    const auth = pending.state.auth;
    if (!auth) throw createError({ statusCode: 400, message: 'Invalid binding challenge' });
    if (pending.state.platform !== 'atcoder' && !body.credential) {
        throw createError({ statusCode: 400, message: 'Credential is required' });
    }
    const result = await verifyPlatformChallenge(event, pending, body.credential);
    try {
        const linked = await prisma.$transaction(async tx => {
            await lockAuthUser(tx, auth.userId);
            await assertAuthState(event, auth);
            await consumePlatformChallenge(event, pending);
            const account = await tx.linkedAccount.create({
                data: {
                    id: randomUUID(),
                    userId: auth.userId,
                    platform: pending.state.platform,
                    platformUid: result.platformUid,
                    platformUsername: result.platformUsername || null
                },
                select: {
                    id: true,
                    platform: true,
                    platformUid: true,
                    platformUsername: true,
                    verifiedAt: true
                }
            });
            const updated = await tx.user.updateMany({
                where: { id: auth.userId, authVersion: auth.authVersion },
                data: { authVersion: { increment: 1 } }
            });
            if (updated.count !== 1)
                throw createError({
                    statusCode: 409,
                    message: 'Your session changed; please authenticate again'
                });
            return account;
        });
        await finishSensitiveMutation(event, auth.userId, auth.authVersion + 1);
        return linked;
    } catch (error) {
        rethrowIdentityMutationError(error);
    }
});
