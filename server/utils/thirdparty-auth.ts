import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createError, isError, setResponseHeader, type H3Event } from 'h3';
import { z } from 'zod';
import type { AuthResult, ReauthPurpose } from '~/types/auth';
import type { OAuthProvider, Platform } from '~/utils/platforms';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { emailSchema, httpUrlSchema } from '~/utils/validation';
import { getConfig, requireRegistrationEnabled } from './config';
import { getPublicBaseUrl } from './base-url';
import { parseBody, parseQuery } from './validation';
import {
    getAuthContext,
    assertAuthState,
    lockAuthUser,
    finishSensitiveMutation,
    type AuthContext
} from './auth';
import { completePrimaryAuthentication, requireFreshReauthentication } from './auth-completion';
import { enforceRateLimit } from './rate-limit';
import { verifyTurnstileToken } from './turnstile';
import {
    AUTH_RANDOM_ID_PATTERN,
    ensureAuthFlowHash,
    assertAuthFlowHash,
    storeAuthFlow,
    readAuthFlow,
    consumeAuthFlow
} from './auth-flow';
import { hashToken } from './token-hash';
import { encryptLinkedAccountTokens } from './linked-account-tokens';
import { createUserWithInitialRole } from './role';
import { getUniqueUsername, getSyntheticEmail } from './username';
import { rethrowIdentityMutationError } from './identity-errors';
import prisma from './prisma';
import {
    buildGitHubAuthorizationUrl,
    exchangeGitHubAuthorizationCode,
    resolveGitHubIdentity
} from './github-oauth';
import {
    buildGoogleAuthorizationUrl,
    exchangeGoogleAuthorizationCode,
    resolveGoogleIdentity
} from './google-oauth';
import {
    buildCodeforcesAuthorizationUrl,
    exchangeCodeforcesAuthorizationCode,
    resolveCodeforcesIdentity
} from './codeforces-oauth';
import {
    buildClistAuthorizationUrl,
    exchangeClistAuthorizationCode,
    resolveClistIdentity,
    generateCodeVerifier,
    generateCodeChallenge
} from './clist-oauth';

export type ThirdpartyAuthMode = 'login' | 'register' | 'bind' | 'reauth';
export interface ThirdpartyIdentity {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
}
interface ProviderTokens {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
}
interface ThirdpartyState {
    provider: OAuthProvider;
    mode: ThirdpartyAuthMode;
    redirect: string;
    redirectUri: string;
    flowHash: string;
    auth?: AuthContext;
    purpose?: ReauthPurpose;
    expectedUid?: string;
    codeVerifier?: string;
}

const startSchema = z
    .strictObject({
        mode: z.enum(['login', 'register', 'bind', 'reauth']).default('login'),
        redirect: z.string().optional(),
        turnstileToken: z.string().max(4096).optional(),
        purpose: z
            .enum([
                'email_change',
                'password_change',
                'mfa_change',
                'passkey_add',
                'passkey_delete',
                'binding_change'
            ])
            .optional()
    })
    .refine(value => value.mode !== 'reauth' || value.purpose !== undefined, {
        path: ['purpose'],
        message: 'Reauthentication purpose is required'
    });
const callbackSchema = z.strictObject({
    code: z.string().min(1).max(8192),
    state: z.string().regex(AUTH_RANDOM_ID_PATTERN)
});

async function providerConfig(provider: OAuthProvider) {
    const idKey = `${provider}_client_id` as const;
    const secretKey = `${provider}_client_secret` as const;
    const config = await getConfig([idKey, secretKey]);
    const clientId = config[idKey].trim();
    const clientSecret = config[secretKey].trim();
    if (!clientId || !clientSecret) {
        throw createError({ statusCode: 503, message: `${provider} login is not configured` });
    }
    return { clientId, clientSecret };
}

function linkedIdentityData(
    id: string,
    platform: Platform,
    identity: ThirdpartyIdentity,
    token?: ProviderTokens
) {
    return {
        id,
        platform,
        platformUid: identity.platformUid,
        platformUsername: identity.platformUsername,
        ...(token
            ? {
                  ...encryptLinkedAccountTokens(id, {
                      oauthAccessToken: token.access_token,
                      oauthRefreshToken: token.refresh_token || null,
                      oauthIdToken: token.id_token || null
                  }),
                  oauthTokenType: token.token_type || null,
                  oauthScope: token.scope || null,
                  oauthExpiresAt:
                      typeof token.expires_in === 'number' &&
                      Number.isFinite(token.expires_in) &&
                      token.expires_in > 0
                          ? new Date(Date.now() + token.expires_in * 1000)
                          : null
              }
            : {})
    };
}

export async function createUserWithLinkedIdentity(
    platform: Platform,
    identity: ThirdpartyIdentity,
    options: { email?: string; token?: ProviderTokens } = {}
) {
    const email = options.email || (await getSyntheticEmail(platform, identity.platformUid));
    const username = await getUniqueUsername(
        identity.platformUsername || `${platform}_${identity.platformUid}`
    );
    const linked = linkedIdentityData(randomUUID(), platform, identity, options.token);
    try {
        return await createUserWithInitialRole({
            data: {
                email,
                username,
                passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 10),
                displayName: identity.displayName?.slice(0, 80) || null,
                avatarUrl:
                    identity.avatarUrl && httpUrlSchema.safeParse(identity.avatarUrl).success
                        ? identity.avatarUrl
                        : null,
                emailVerified: Boolean(options.email && identity.emailVerified),
                linkedAccounts: { create: linked }
            },
            select: { id: true, authVersion: true }
        });
    } catch (error) {
        rethrowIdentityMutationError(error);
    }
}

export async function startThirdpartyAuthentication(event: H3Event, provider: OAuthProvider) {
    setResponseHeader(event, 'Cache-Control', 'no-store');
    const query = parseQuery(event, startSchema);
    if (query.mode === 'register') await requireRegistrationEnabled();
    const config = await providerConfig(provider);
    let auth: AuthContext | undefined;
    let expectedUid: string | undefined;
    if (query.mode === 'bind' || query.mode === 'reauth') {
        auth =
            query.mode === 'bind'
                ? await requireFreshReauthentication(event, 'binding_change')
                : getAuthContext(event);
        await assertAuthState(event, auth);
        await enforceRateLimit(event, 'challenge', auth.userId);
        const existing = await prisma.linkedAccount.findUnique({
            where: { userId_platform: { userId: auth.userId, platform: provider } },
            select: { platformUid: true }
        });
        if (query.mode === 'bind' && existing) {
            throw createError({
                statusCode: 409,
                message: `You have already linked a ${provider} account`
            });
        }
        if (query.mode === 'reauth' && !existing) {
            throw createError({
                statusCode: 400,
                message: 'Reauthentication requires an account already linked to you'
            });
        }
        expectedUid = existing?.platformUid;
    } else {
        await enforceRateLimit(event, query.mode === 'register' ? 'register' : 'challenge');
        await verifyTurnstileToken({
            token: query.turnstileToken,
            action: query.mode === 'register' ? 'register' : 'login'
        });
    }
    const state = randomBytes(32).toString('base64url');
    const redirectUri = new URL(`/oauth/thirdparty/${provider}`, getPublicBaseUrl()).toString();
    const codeVerifier = provider === 'clist' ? generateCodeVerifier() : undefined;
    const params = { clientId: config.clientId, redirectUri, state };
    let authorizationUrl: string;
    switch (provider) {
        case 'github':
            authorizationUrl = buildGitHubAuthorizationUrl(params);
            break;
        case 'google':
            authorizationUrl = buildGoogleAuthorizationUrl(params);
            break;
        case 'codeforces':
            authorizationUrl = await buildCodeforcesAuthorizationUrl(params);
            break;
        case 'clist':
            authorizationUrl = buildClistAuthorizationUrl({
                ...params,
                codeChallenge: generateCodeChallenge(codeVerifier!)
            });
            break;
    }
    const payload: ThirdpartyState = {
        provider,
        mode: query.mode,
        redirect: getSafeRedirectTarget(query.redirect),
        redirectUri,
        flowHash: ensureAuthFlowHash(event),
        auth,
        expectedUid,
        purpose: query.mode === 'reauth' ? query.purpose : undefined,
        codeVerifier
    };
    await storeAuthFlow(`cp-oauth:v2:auth:oauth-state:${hashToken(state)}`, payload);
    return { authorizationUrl };
}

async function resolveProviderIdentity(
    provider: OAuthProvider,
    code: string,
    state: ThirdpartyState
) {
    const config = await providerConfig(provider);
    const params = { ...config, code, redirectUri: state.redirectUri };
    switch (provider) {
        case 'github': {
            const token = await exchangeGitHubAuthorizationCode(params);
            return { token, identity: await resolveGitHubIdentity(token.access_token) };
        }
        case 'google': {
            const token = await exchangeGoogleAuthorizationCode(params);
            return { token, identity: await resolveGoogleIdentity(token.access_token) };
        }
        case 'codeforces': {
            const exchanged = await exchangeCodeforcesAuthorizationCode(params);
            return {
                token: exchanged.token,
                identity: await resolveCodeforcesIdentity({ ...exchanged, ...config })
            };
        }
        case 'clist': {
            if (!state.codeVerifier)
                throw createError({
                    statusCode: 400,
                    message: 'Invalid Clist authentication state'
                });
            const token = await exchangeClistAuthorizationCode({
                ...params,
                codeVerifier: state.codeVerifier
            });
            return { token, identity: await resolveClistIdentity(token.access_token) };
        }
    }
}

async function authenticateLinkedIdentity(
    provider: OAuthProvider,
    identity: ThirdpartyIdentity,
    token: ProviderTokens
) {
    const emailResult = identity.email ? emailSchema.safeParse(identity.email) : null;
    const verifiedEmail = identity.emailVerified && emailResult?.success ? emailResult.data : null;
    try {
        const existing = await prisma.$transaction(async tx => {
            const linked = await tx.linkedAccount.findUnique({
                where: {
                    platform_platformUid: { platform: provider, platformUid: identity.platformUid }
                },
                select: { id: true, userId: true }
            });
            if (linked) {
                await lockAuthUser(tx, linked.userId);
                const current = await tx.linkedAccount.findUnique({
                    where: { id: linked.id },
                    select: { id: true, userId: true }
                });
                if (!current || current.userId !== linked.userId) {
                    throw createError({
                        statusCode: 409,
                        message: 'Account binding changed; please restart authentication'
                    });
                }
                const {
                    id: _id,
                    platform: _platform,
                    platformUid: _uid,
                    ...updates
                } = linkedIdentityData(linked.id, provider, identity, token);
                await tx.linkedAccount.update({ where: { id: linked.id }, data: updates });
                return tx.user.findUniqueOrThrow({
                    where: { id: linked.userId },
                    select: { id: true, authVersion: true }
                });
            }
            if (!verifiedEmail) return null;
            const matched = await tx.user.findUnique({
                where: { email: verifiedEmail },
                select: { id: true, emailVerified: true }
            });
            if (!matched?.emailVerified) return null;
            await lockAuthUser(tx, matched.id);
            const current = await tx.user.findUnique({
                where: { id: matched.id },
                select: { email: true, emailVerified: true }
            });
            if (!current || !current.emailVerified || current.email !== verifiedEmail) {
                throw createError({
                    statusCode: 409,
                    message: 'Verified email changed; please restart authentication'
                });
            }
            const existingPlatform = await tx.linkedAccount.findUnique({
                where: { userId_platform: { userId: matched.id, platform: provider } },
                select: { id: true }
            });
            if (existingPlatform) return null;
            await tx.linkedAccount.create({
                data: {
                    userId: matched.id,
                    ...linkedIdentityData(randomUUID(), provider, identity, token)
                }
            });
            return tx.user.update({
                where: { id: matched.id },
                data: { authVersion: { increment: 1 } },
                select: { id: true, authVersion: true }
            });
        });
        if (existing) return existing;
        const emailOwner = verifiedEmail
            ? await prisma.user.findUnique({
                  where: { email: verifiedEmail },
                  select: { id: true }
              })
            : null;
        return await createUserWithLinkedIdentity(provider, identity, {
            email: verifiedEmail && !emailOwner ? verifiedEmail : undefined,
            token
        });
    } catch (error) {
        rethrowIdentityMutationError(error);
    }
}

async function bindProviderIdentity(
    event: H3Event,
    provider: OAuthProvider,
    state: ThirdpartyState,
    identity: ThirdpartyIdentity,
    token: ProviderTokens
) {
    const auth = state.auth!;
    await assertAuthState(event, auth);
    try {
        const user = await prisma.$transaction(async tx => {
            await lockAuthUser(tx, auth.userId);
            await assertAuthState(event, auth);
            const existing = await tx.linkedAccount.findUnique({
                where: { userId_platform: { userId: auth.userId, platform: provider } },
                select: { id: true }
            });
            if (existing)
                throw createError({
                    statusCode: 409,
                    message: `You have already linked a ${provider} account`
                });
            await tx.linkedAccount.create({
                data: {
                    userId: auth.userId,
                    ...linkedIdentityData(randomUUID(), provider, identity, token)
                }
            });
            const updated = await tx.user.updateMany({
                where: { id: auth.userId, authVersion: auth.authVersion },
                data: { authVersion: { increment: 1 } }
            });
            if (updated.count !== 1)
                throw createError({
                    statusCode: 409,
                    message: 'Your session changed; please authenticate again'
                });
            return { id: auth.userId, authVersion: auth.authVersion + 1 };
        });
        await finishSensitiveMutation(event, user.id, user.authVersion);
        return { bound: true, redirect: state.redirect } as const;
    } catch (error) {
        rethrowIdentityMutationError(error);
    }
}

export async function completeThirdpartyAuthentication(
    event: H3Event,
    provider: OAuthProvider
): Promise<AuthResult> {
    setResponseHeader(event, 'Cache-Control', 'no-store');
    const body = await parseBody(event, callbackSchema);
    const key = `cp-oauth:v2:auth:oauth-state:${hashToken(body.state)}`;
    const pending = await readAuthFlow<ThirdpartyState>(key);
    const state = pending.value;
    assertAuthFlowHash(event, state.flowHash);
    const redirectUri = new URL(`/oauth/thirdparty/${provider}`, getPublicBaseUrl()).toString();
    if (state.provider !== provider || state.redirectUri !== redirectUri) {
        throw createError({ statusCode: 400, message: 'Invalid OAuth authentication state' });
    }
    try {
        if (state.mode === 'bind' || state.mode === 'reauth') {
            if (!state.auth)
                throw createError({
                    statusCode: 400,
                    message: 'Invalid authenticated OAuth state'
                });
            await assertAuthState(event, state.auth);
        }
        await consumeAuthFlow(key, pending.raw);
        const { identity, token } = await resolveProviderIdentity(provider, body.code, state);
        if (state.mode === 'bind')
            return await bindProviderIdentity(event, provider, state, identity, token);
        if (state.mode === 'reauth') {
            await assertAuthState(event, state.auth!);
            const linked = await prisma.linkedAccount.findUnique({
                where: { userId_platform: { userId: state.auth!.userId, platform: provider } },
                select: { platformUid: true }
            });
            if (
                !state.purpose ||
                !linked ||
                linked.platformUid !== identity.platformUid ||
                state.expectedUid !== identity.platformUid
            ) {
                throw createError({
                    statusCode: 403,
                    message: 'Use the provider account already linked to your current account'
                });
            }
            return await completePrimaryAuthentication(event, state.auth!.userId, {
                redirect: state.redirect,
                mode: 'reauth',
                purpose: state.purpose,
                sessionId: state.auth!.sessionId,
                authVersion: state.auth!.authVersion
            });
        }
        await enforceRateLimit(event, 'login', `${provider}:${identity.platformUid}`);
        const user = await authenticateLinkedIdentity(provider, identity, token);
        return await completePrimaryAuthentication(event, user.id, {
            redirect: state.redirect,
            mode: state.mode,
            authVersion: user.authVersion
        });
    } catch (error) {
        if (isError(error)) {
            error.data = {
                ...(error.data && typeof error.data === 'object' ? error.data : {}),
                redirect: getSafeRedirectTarget(state.redirect)
            };
        }
        throw error;
    }
}
