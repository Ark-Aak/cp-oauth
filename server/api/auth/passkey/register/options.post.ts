import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import { assertAuthState } from '~/server/utils/auth';
import { requireFreshReauthentication } from '~/server/utils/auth-completion';
import { buildRegistrationOptions, getPasskeyRpInfo } from '~/server/utils/passkey';
import {
    buildPasskeyRegisterChallengeKey,
    setRedisJson,
    securityRedis
} from '~/server/utils/security';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { parseBody } from '~/server/utils/validation';
import { getRedis } from '~/server/utils/redis';

export default defineEventHandler(async event => {
    const body = await parseBody(
        event,
        z.object({ reauthToken: z.string().min(1).max(256) }).strict()
    );
    const auth = await requireFreshReauthentication(event, 'passkey_add', body.reauthToken);
    await enforceRateLimit(event, 'challenge', auth.userId);
    await assertAuthState(event, auth);
    const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: {
            id: true,
            username: true,
            displayName: true,
            passkeyCredentials: { select: { credentialId: true } }
        }
    });
    if (!user) throw createError({ statusCode: 401, message: 'Authentication required' });
    const options = await buildRegistrationOptions({
        rpInfo: getPasskeyRpInfo(),
        userId: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        existingCredentialIds: user.passkeyCredentials.map(item => item.credentialId)
    });
    const key = buildPasskeyRegisterChallengeKey(auth.userId, auth.sessionId);
    await securityRedis(() => getRedis().del(`${key}:attempts`));
    await setRedisJson(key, { challenge: options.challenge, auth, purpose: 'passkey_add' }, 300);
    return options;
});
