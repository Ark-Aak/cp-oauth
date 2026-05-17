import crypto from 'crypto';
import prisma from '~/server/utils/prisma';
import { signAuthToken } from '~/server/utils/auth';
import { createAuthUserResponse } from '~/server/utils/user-response';
import { getPasskeyRpInfo, verifyAuthentication } from '~/server/utils/passkey';
import {
    build2faLoginChallengeKey,
    buildPasskeyLoginChallengeKey,
    delRedisKey,
    generateSixDigitCode,
    getRedisJson,
    hashCode,
    setRedisJson
} from '~/server/utils/security';
import { sendTwoFactorEmailCode } from '~/server/utils/mailer';

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const challengeId = String(body?.challengeId || '');
    type AuthenticationResponseType = Parameters<typeof verifyAuthentication>[0]['response'];
    const response = body?.response as AuthenticationResponseType | undefined;

    if (!challengeId || !response) {
        throw createError({ statusCode: 400, message: 'challengeId and response are required' });
    }

    const key = buildPasskeyLoginChallengeKey(challengeId);
    const challenge = await getRedisJson<{
        challenge: string;
        userId: string;
    }>(key);
    if (!challenge) {
        throw createError({ statusCode: 400, message: 'Passkey challenge is invalid or expired' });
    }

    const credentialId = response.id;
    const passkey = await prisma.passkeyCredential.findUnique({
        where: { credentialId },
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                    displayName: true,
                    email: true,
                    twoFactorEnabled: true,
                    twoFactorMethod: true
                }
            }
        }
    });

    if (!passkey || passkey.userId !== challenge.userId) {
        throw createError({ statusCode: 401, message: 'Passkey not found' });
    }

    const verified = await verifyAuthentication({
        response,
        expectedChallenge: challenge.challenge,
        rpInfo: getPasskeyRpInfo(event),
        credentialId: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports
    });

    if (!verified.verified || !verified.authenticationInfo) {
        throw createError({ statusCode: 401, message: 'Passkey verification failed' });
    }

    await prisma.passkeyCredential.update({
        where: { id: passkey.id },
        data: { counter: verified.authenticationInfo.newCounter }
    });

    await delRedisKey(key);

    if (passkey.user.twoFactorEnabled && passkey.user.twoFactorMethod) {
        const loginChallengeId = crypto.randomUUID();

        if (passkey.user.twoFactorMethod === 'email_otp') {
            const code = generateSixDigitCode();
            const sent = await sendTwoFactorEmailCode(passkey.user.email, code);
            if (!sent) {
                throw createError({ statusCode: 503, message: 'SMTP is not configured' });
            }
            await setRedisJson(
                build2faLoginChallengeKey(loginChallengeId),
                {
                    userId: passkey.user.id,
                    method: 'email_otp',
                    emailCodeHash: await hashCode(code)
                },
                600
            );
        } else {
            await setRedisJson(
                build2faLoginChallengeKey(loginChallengeId),
                {
                    userId: passkey.user.id,
                    method: 'totp'
                },
                600
            );
        }

        return {
            requiresTwoFactor: true,
            method: passkey.user.twoFactorMethod,
            challengeId: loginChallengeId
        };
    }

    return {
        token: await signAuthToken(passkey.user.id),
        user: createAuthUserResponse(passkey.user)
    };
});
