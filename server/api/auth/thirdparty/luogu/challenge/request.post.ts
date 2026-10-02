import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { parseBody } from '~/server/utils/validation';
import { verifyTurnstileToken } from '~/server/utils/turnstile';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import {
    createPlatformChallenge,
    normalizePlatformUid,
    platformUidSchema
} from '~/server/utils/platform-flow';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

const requestSchema = z.strictObject({
    luoguUid: platformUidSchema,
    redirect: z.string().optional(),
    turnstileToken: z.string().max(4096).optional()
});

export default defineEventHandler(async event => {
    const body = await parseBody(event, requestSchema);
    const platformUid = normalizePlatformUid('luogu', body.luoguUid);
    await enforceRateLimit(event, 'challenge', `luogu:${platformUid}`);
    await verifyTurnstileToken({ token: body.turnstileToken, action: 'luogu_challenge' });
    // Luogu login only authenticates an existing binding. It never registers or auto-links a user.
    const linked = await prisma.linkedAccount.findUnique({
        where: { platform_platformUid: { platform: 'luogu', platformUid } },
        select: { userId: true, user: { select: { authVersion: true } } }
    });
    if (!linked) {
        throw createError({
            statusCode: 404,
            message:
                'This Luogu account is not linked. Register a local account and link it before using Luogu login.'
        });
    }
    return createPlatformChallenge(event, {
        mode: 'login',
        platform: 'luogu',
        platformUid,
        userId: linked.userId,
        authVersion: linked.user.authVersion,
        redirect: getSafeRedirectTarget(body.redirect)
    });
});
