import { z } from 'zod';
import { defineEventHandler, createError } from 'h3';
import prisma from '~/server/utils/prisma';
import { getAuthContext, assertAuthState } from '~/server/utils/auth';
import { reauthPurposeSchema } from '~/server/utils/auth-completion';
import { createPlatformChallenge, verifiablePlatformSchema } from '~/server/utils/platform-flow';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { parseBody } from '~/server/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

export default defineEventHandler(async event => {
    const auth = getAuthContext(event);
    const body = await parseBody(
        event,
        z
            .object({
                purpose: reauthPurposeSchema,
                platform: verifiablePlatformSchema,
                redirect: z.string().max(4096).optional()
            })
            .strict()
    );
    await assertAuthState(event, auth);
    await enforceRateLimit(event, 'challenge', auth.userId);
    const linked = await prisma.linkedAccount.findUnique({
        where: { userId_platform: { userId: auth.userId, platform: body.platform } },
        select: { platformUid: true }
    });
    if (!linked) {
        throw createError({
            statusCode: 400,
            message: 'Use an account already bound to your current identity'
        });
    }
    const challenge = await createPlatformChallenge(event, {
        mode: 'reauth',
        platform: body.platform,
        platformUid: linked.platformUid,
        purpose: body.purpose,
        redirect: getSafeRedirectTarget(body.redirect),
        auth
    });
    return { ...challenge, platform: body.platform, platformUid: linked.platformUid };
});
