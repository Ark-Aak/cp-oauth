import { z } from 'zod';
import prisma from '~/server/utils/prisma';
import {
    getAuthContext,
    assertAuthState,
    finishSensitiveMutation,
    lockAuthUser
} from '~/server/utils/auth';
import {
    getPasskeyRpInfo,
    registrationResponseSchema,
    verifyRegistration
} from '~/server/utils/passkey';
import {
    authChallengeExpired,
    buildPasskeyRegisterChallengeKey,
    consumeChallengeAttempt,
    deleteRedisKeyIfValue,
    getRedisJsonWithRaw
} from '~/server/utils/security';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import { parseBody } from '~/server/utils/validation';

const pendingSchema = z
    .object({
        challenge: z.string(),
        purpose: z.literal('passkey_add'),
        auth: z
            .object({
                userId: z.string(),
                sessionId: z.string(),
                authVersion: z.number().int(),
                role: z.string()
            })
            .strict()
    })
    .strict();

export default defineEventHandler(async event => {
    const auth = getAuthContext(event);
    const body = await parseBody(
        event,
        z
            .object({
                response: registrationResponseSchema,
                name: z.string().trim().min(1).max(100).optional()
            })
            .strict()
    );
    await enforceRateLimit(event, 'mfa');
    const key = buildPasskeyRegisterChallengeKey(auth.userId, auth.sessionId);
    const entry = await getRedisJsonWithRaw<unknown>(key);
    if (!entry) authChallengeExpired();
    const parsed = pendingSchema.safeParse(entry.value);
    if (!parsed.success) authChallengeExpired();
    const pending = parsed.data;
    await assertAuthState(event, pending.auth);
    await consumeChallengeAttempt(event, key);
    const verification = await verifyRegistration({
        response: body.response,
        expectedChallenge: pending.challenge,
        rpInfo: getPasskeyRpInfo()
    }).catch(() => {
        throw createError({
            statusCode: 400,
            message: 'Passkey registration verification failed',
            data: { code: 'INVALID_PASSKEY_CREDENTIAL' }
        });
    });
    if (!verification.verified || !verification.registrationInfo) {
        throw createError({
            statusCode: 400,
            message: 'Passkey registration verification failed',
            data: { code: 'INVALID_PASSKEY_CREDENTIAL' }
        });
    }
    const credential = verification.registrationInfo.credential;
    const user = await prisma
        .$transaction(async tx => {
            await lockAuthUser(tx, auth.userId);
            await assertAuthState(event, pending.auth);
            if (!(await deleteRedisKeyIfValue(key, entry.raw))) authChallengeExpired();
            await tx.passkeyCredential.create({
                data: {
                    userId: auth.userId,
                    name: body.name || 'My Passkey',
                    credentialId: credential.id,
                    publicKey: Buffer.from(credential.publicKey).toString('base64'),
                    counter: credential.counter,
                    transports: credential.transports || []
                }
            });
            return tx.user.update({
                where: { id: auth.userId, authVersion: pending.auth.authVersion },
                data: { authVersion: { increment: 1 } },
                select: { authVersion: true }
            });
        })
        .catch(error => {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
                throw createError({ statusCode: 409, message: 'Passkey is already registered' });
            }
            throw error;
        });
    await finishSensitiveMutation(event, auth.userId, user.authVersion);
    return { success: true };
});
