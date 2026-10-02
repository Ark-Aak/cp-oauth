import { z } from 'zod';
import { defineEventHandler } from 'h3';
import prisma from '~/server/utils/prisma';
import { assertAuthState, lockAuthUser } from '~/server/utils/auth';
import { completePrimaryAuthentication } from '~/server/utils/auth-completion';
import { authChallengeExpired } from '~/server/utils/security';
import {
    readPlatformChallenge,
    verifyPlatformChallenge,
    consumePlatformChallenge,
    platformChallengeIdSchema
} from '~/server/utils/platform-flow';
import { parseBody } from '~/server/utils/validation';

export default defineEventHandler(async event => {
    const body = await parseBody(
        event,
        z
            .object({
                requestId: platformChallengeIdSchema,
                credential: z.string().max(2048)
            })
            .strict()
    );
    const pending = await readPlatformChallenge(event, body.requestId, { mode: 'reauth' });
    const state = pending.state;
    if (!state.auth || !state.purpose) authChallengeExpired();
    const auth = state.auth;
    await assertAuthState(event, auth);
    const linked = await prisma.linkedAccount.findUnique({
        where: { userId_platform: { userId: auth.userId, platform: state.platform } },
        select: { platformUid: true }
    });
    if (!linked || linked.platformUid !== state.platformUid) authChallengeExpired();
    await verifyPlatformChallenge(event, pending, body.credential);
    await prisma.$transaction(async tx => {
        await lockAuthUser(tx, auth.userId);
        await assertAuthState(event, auth);
        const current = await tx.linkedAccount.findUnique({
            where: { userId_platform: { userId: auth.userId, platform: state.platform } },
            select: { platformUid: true }
        });
        if (!current || current.platformUid !== state.platformUid) authChallengeExpired();
        await consumePlatformChallenge(event, pending);
    });
    return completePrimaryAuthentication(event, auth.userId, {
        mode: 'reauth',
        purpose: state.purpose,
        sessionId: auth.sessionId,
        authVersion: auth.authVersion,
        redirect: state.redirect
    });
});
