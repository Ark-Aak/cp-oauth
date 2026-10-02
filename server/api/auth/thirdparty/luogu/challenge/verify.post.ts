import { z } from 'zod';
import { parseBody } from '~/server/utils/validation';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { completePrimaryAuthentication } from '~/server/utils/auth-completion';
import {
    platformChallengeIdSchema,
    readPlatformChallenge,
    verifyPlatformChallenge,
    consumePlatformChallenge
} from '~/server/utils/platform-flow';

const verifySchema = z.strictObject({
    requestId: platformChallengeIdSchema,
    pasteId: z.string().trim().min(1).max(2048)
});

export default defineEventHandler(async event => {
    const body = await parseBody(event, verifySchema);
    const pending = await readPlatformChallenge(event, body.requestId, {
        mode: 'login',
        platform: 'luogu'
    });
    await enforceRateLimit(event, 'login', `luogu:${pending.state.platformUid}`);
    await verifyPlatformChallenge(event, pending, body.pasteId);
    await consumePlatformChallenge(event, pending);
    // No registration fallback: the challenge keeps the original binding and credential version.
    return completePrimaryAuthentication(event, pending.state.userId!, {
        redirect: pending.state.redirect,
        mode: 'login',
        authVersion: pending.state.authVersion
    });
});
