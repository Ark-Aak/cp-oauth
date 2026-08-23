import crypto from 'crypto';
import prisma from '~/server/utils/prisma';
import { buildAuthenticationOptions, getPasskeyRpInfo } from '~/server/utils/passkey';
import { buildPasskeyLoginChallengeKey, setRedisJson } from '~/server/utils/security';

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const email = normalizeUsername(body.email);

    if (!email) {
        throw createError({ statusCode: 400, message: 'Email is required' });
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            passkeyCredentials: {
                select: {
                    credentialId: true
                }
            }
        }
    });

    if (!user || user.passkeyCredentials.length === 0) {
        throw createError({ statusCode: 404, message: 'No passkey found for this email' });
    }

    const options = await buildAuthenticationOptions({
        rpInfo: getPasskeyRpInfo(event),
        allowCredentialIds: user.passkeyCredentials.map(item => item.credentialId)
    });

    const challengeId = crypto.randomUUID();
    await setRedisJson(
        buildPasskeyLoginChallengeKey(challengeId),
        {
            challenge: options.challenge,
            userId: user.id,
            email
        },
        300
    );

    return {
        challengeId,
        options
    };
});
