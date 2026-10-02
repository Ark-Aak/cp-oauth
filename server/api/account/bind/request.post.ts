import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { parseBody } from '~/server/utils/validation';
import { requireFreshReauthentication } from '~/server/utils/auth-completion';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import {
    createPlatformChallenge,
    normalizePlatformUid,
    platformUidSchema,
    verifiablePlatformSchema
} from '~/server/utils/platform-flow';

const requestSchema = z.strictObject({
    platform: verifiablePlatformSchema,
    platformUid: platformUidSchema,
    reauthToken: z.string().min(1).max(256).optional()
});

export default defineEventHandler(async event => {
    const body = await parseBody(event, requestSchema);
    const platformUid = normalizePlatformUid(body.platform, body.platformUid);
    const auth = await requireFreshReauthentication(event, 'binding_change', body.reauthToken);
    await enforceRateLimit(event, 'challenge', auth.userId);
    const [existing, taken] = await Promise.all([
        prisma.linkedAccount.findUnique({
            where: { userId_platform: { userId: auth.userId, platform: body.platform } },
            select: { id: true }
        }),
        prisma.linkedAccount.findUnique({
            where: { platform_platformUid: { platform: body.platform, platformUid } },
            select: { id: true }
        })
    ]);
    if (existing)
        throw createError({
            statusCode: 409,
            message: 'You have already linked an account for this platform'
        });
    if (taken)
        throw createError({ statusCode: 409, message: 'This platform account is already linked' });
    return createPlatformChallenge(event, {
        mode: 'bind',
        platform: body.platform,
        platformUid,
        redirect: '/profile?tab=bindings',
        auth
    });
});
