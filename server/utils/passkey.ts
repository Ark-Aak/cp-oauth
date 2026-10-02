import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse
} from '@simplewebauthn/server';
import { randomBytes } from 'node:crypto';
import { createError, type H3Event } from 'h3';
import { z } from 'zod';
import type { ReauthPurpose } from '~/types/auth';
import { getPublicBaseUrl } from '~/server/utils/base-url';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import prisma from '~/server/utils/prisma';
import { getAuthContext, assertAuthState, lockAuthUser } from '~/server/utils/auth';
import { completePrimaryAuthentication, reauthPurposeSchema } from '~/server/utils/auth-completion';
import { ensureAuthFlowHash, assertAuthFlowHash } from '~/server/utils/auth-flow';
import { enforceRateLimit } from '~/server/utils/rate-limit';
import {
    authChallengeExpired,
    buildPasskeyLoginChallengeKey,
    consumeChallengeAttempt,
    deleteRedisKeyIfValue,
    getRedisJsonWithRaw,
    setRedisJson
} from '~/server/utils/security';

export interface PasskeyRpInfo {
    rpID: string;
    rpName: string;
    origin: string;
}

export const registrationResponseSchema = z
    .object({
        id: z.string().min(1).max(2048),
        rawId: z.string().min(1).max(2048),
        type: z.literal('public-key'),
        response: z
            .object({
                clientDataJSON: z.string().min(1).max(16384),
                attestationObject: z.string().min(1).max(65536),
                transports: z
                    .array(
                        z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'])
                    )
                    .optional()
            })
            .passthrough(),
        clientExtensionResults: z
            .object({
                appid: z.boolean().optional(),
                credProps: z.object({ rk: z.boolean().optional() }).optional(),
                hmacCreateSecret: z.boolean().optional()
            })
            .passthrough(),
        authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional()
    })
    .strict();
export const authenticationResponseSchema = z
    .object({
        id: z.string().min(1).max(2048),
        rawId: z.string().min(1).max(2048),
        type: z.literal('public-key'),
        response: z
            .object({
                clientDataJSON: z.string().min(1).max(16384),
                authenticatorData: z.string().min(1).max(16384),
                signature: z.string().min(1).max(16384),
                userHandle: z.string().max(2048).optional()
            })
            .strict(),
        clientExtensionResults: z
            .object({
                appid: z.boolean().optional(),
                credProps: z.object({ rk: z.boolean().optional() }).optional(),
                hmacCreateSecret: z.boolean().optional()
            })
            .passthrough(),
        authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional()
    })
    .strict();
type RegistrationResponseType = Parameters<typeof verifyRegistrationResponse>[0]['response'];
type AuthenticationResponseType = Parameters<typeof verifyAuthenticationResponse>[0]['response'];

export function getPasskeyRpInfo(): PasskeyRpInfo {
    const url = new URL(getPublicBaseUrl());
    return {
        rpID: url.hostname,
        rpName: 'CP OAuth',
        origin: `${url.protocol}//${url.host}`
    };
}

export async function buildRegistrationOptions(params: {
    rpInfo: PasskeyRpInfo;
    userId: string;
    username: string;
    displayName: string;
    existingCredentialIds: string[];
}) {
    return generateRegistrationOptions({
        rpName: params.rpInfo.rpName,
        rpID: params.rpInfo.rpID,
        userName: params.username,
        userID: new TextEncoder().encode(params.userId),
        userDisplayName: params.displayName,
        timeout: 60000,
        attestationType: 'none',
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'required'
        },
        excludeCredentials: params.existingCredentialIds.map(credentialId => ({
            id: credentialId,
            type: 'public-key'
        }))
    });
}

export async function verifyRegistration(params: {
    response: RegistrationResponseType;
    expectedChallenge: string;
    rpInfo: PasskeyRpInfo;
}) {
    return verifyRegistrationResponse({
        response: params.response,
        expectedChallenge: params.expectedChallenge,
        expectedOrigin: params.rpInfo.origin,
        expectedRPID: params.rpInfo.rpID,
        requireUserVerification: true
    });
}

export async function buildAuthenticationOptions(params: {
    rpInfo: PasskeyRpInfo;
    allowCredentialIds: string[];
}) {
    return generateAuthenticationOptions({
        rpID: params.rpInfo.rpID,
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: params.allowCredentialIds.map(credentialId => ({
            id: credentialId,
            type: 'public-key'
        }))
    });
}

export async function verifyAuthentication(params: {
    response: AuthenticationResponseType;
    expectedChallenge: string;
    rpInfo: PasskeyRpInfo;
    credentialId: string;
    publicKey: string;
    counter: number;
}) {
    return verifyAuthenticationResponse({
        response: params.response,
        expectedChallenge: params.expectedChallenge,
        expectedOrigin: params.rpInfo.origin,
        expectedRPID: params.rpInfo.rpID,
        requireUserVerification: true,
        credential: {
            id: params.credentialId,
            publicKey: Buffer.from(params.publicKey, 'base64'),
            counter: params.counter
        }
    });
}

const authenticationChallengeSchema = z
    .object({
        challenge: z.string(),
        flowHash: z.string(),
        redirect: z.string(),
        mode: z.enum(['login', 'reauth']),
        userId: z.string().nullable(),
        authVersion: z.number().int().nullable(),
        discoverable: z.boolean(),
        auth: z
            .object({
                userId: z.string(),
                sessionId: z.string(),
                authVersion: z.number().int(),
                role: z.string()
            })
            .strict()
            .optional(),
        purpose: reauthPurposeSchema.optional()
    })
    .strict();

export async function beginPasskeyAuthentication(
    event: H3Event,
    context: {
        mode: 'login' | 'reauth';
        email?: string;
        redirect: string;
        purpose?: ReauthPurpose;
    }
) {
    const auth = context.mode === 'reauth' ? getAuthContext(event) : undefined;
    if (auth) await assertAuthState(event, auth);
    await enforceRateLimit(event, 'login', auth?.userId || context.email);
    const user =
        auth || context.email
            ? await prisma.user.findUnique({
                  where: auth ? { id: auth.userId } : { email: context.email! },
                  select: {
                      id: true,
                      authVersion: true,
                      passkeyCredentials: { select: { credentialId: true } }
                  }
              })
            : null;
    const options = await buildAuthenticationOptions({
        rpInfo: getPasskeyRpInfo(),
        allowCredentialIds: user?.passkeyCredentials.map(item => item.credentialId) || []
    });
    const challengeId = randomBytes(32).toString('base64url');
    await setRedisJson(
        buildPasskeyLoginChallengeKey(challengeId),
        {
            challenge: options.challenge,
            flowHash: ensureAuthFlowHash(event),
            redirect: getSafeRedirectTarget(context.redirect),
            mode: context.mode,
            userId: user?.id || null,
            authVersion: user?.authVersion ?? null,
            discoverable: context.mode === 'login' && !context.email,
            auth,
            purpose: context.purpose
        },
        300
    );
    return { challengeId, options };
}

export async function completePasskeyAuthentication(
    event: H3Event,
    challengeId: string,
    response: AuthenticationResponseType,
    mode: 'login' | 'reauth'
) {
    await enforceRateLimit(event, 'login', response.id);
    const key = buildPasskeyLoginChallengeKey(challengeId);
    const entry = await getRedisJsonWithRaw<unknown>(key);
    if (!entry) authChallengeExpired();
    const parsed = authenticationChallengeSchema.safeParse(entry.value);
    if (!parsed.success || parsed.data.mode !== mode) authChallengeExpired();
    const challenge = parsed.data;
    assertAuthFlowHash(event, challenge.flowHash);
    if (challenge.auth) await assertAuthState(event, challenge.auth);
    await consumeChallengeAttempt(event, key);
    const passkey = await prisma.passkeyCredential.findUnique({
        where: { credentialId: response.id },
        include: { user: { select: { authVersion: true } } }
    });
    if (
        !passkey ||
        (!challenge.discoverable && passkey.userId !== challenge.userId) ||
        (challenge.authVersion !== null && passkey.user.authVersion !== challenge.authVersion)
    ) {
        throw createError({
            statusCode: 401,
            message: 'Passkey verification failed',
            data: { code: 'INVALID_PASSKEY_CREDENTIAL' }
        });
    }
    const verification = await verifyAuthentication({
        response,
        expectedChallenge: challenge.challenge,
        rpInfo: getPasskeyRpInfo(),
        credentialId: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter
    }).catch(() => {
        throw createError({
            statusCode: 401,
            message: 'Passkey verification failed',
            data: { code: 'INVALID_PASSKEY_CREDENTIAL' }
        });
    });
    if (!verification.verified) {
        throw createError({
            statusCode: 401,
            message: 'Passkey verification failed',
            data: { code: 'INVALID_PASSKEY_CREDENTIAL' }
        });
    }
    await prisma.$transaction(async tx => {
        await lockAuthUser(tx, passkey.userId);
        if (challenge.auth) await assertAuthState(event, challenge.auth);
        const current = await tx.user.findUnique({
            where: { id: passkey.userId },
            select: { authVersion: true }
        });
        if (!current || current.authVersion !== passkey.user.authVersion) authChallengeExpired();
        if (!(await deleteRedisKeyIfValue(key, entry.raw))) authChallengeExpired();
        const updated = await tx.passkeyCredential.updateMany({
            where: { id: passkey.id, userId: passkey.userId, counter: passkey.counter },
            data: { counter: verification.authenticationInfo.newCounter }
        });
        if (updated.count !== 1) authChallengeExpired();
    });
    return completePrimaryAuthentication(event, passkey.userId, {
        redirect: challenge.redirect,
        mode,
        purpose: challenge.purpose,
        sessionId: challenge.auth?.sessionId,
        authVersion: passkey.user.authVersion
    });
}
