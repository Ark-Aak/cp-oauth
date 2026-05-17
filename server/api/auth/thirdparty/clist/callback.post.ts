import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { consola } from 'consola';
import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';
import { getConfig } from '~/server/utils/config';
import {
    exchangeClistAuthorizationCode,
    getClistUniqueUsername,
    resolveClistIdentity
} from '~/server/utils/clist-oauth';

const logger = consola.withTag('auth:clist:callback');

interface CallbackBody {
    code?: string;
    state?: string;
}

type ClistOAuthMode = 'login' | 'bind' | 'register';

interface ClistOAuthCredentialSnapshot {
    oauthAccessToken: string;
    oauthRefreshToken: string | null;
    oauthTokenType: string | null;
    oauthExpiresAt: Date | null;
    oauthScope: string | null;
}

function buildClistOAuthCredentialSnapshot(token: {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
}): ClistOAuthCredentialSnapshot {
    const expiresAt =
        typeof token.expires_in === 'number' && Number.isFinite(token.expires_in)
            ? new Date(Date.now() + token.expires_in * 1000)
            : null;

    return {
        oauthAccessToken: token.access_token,
        oauthRefreshToken: token.refresh_token || null,
        oauthTokenType: token.token_type || null,
        oauthExpiresAt: expiresAt,
        oauthScope: token.scope || null
    };
}

async function allocateSyntheticEmail(platformUid: string): Promise<string> {
    const base = `clist_${platformUid.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 40);
    for (let i = 0; i <= 9999; i += 1) {
        const suffix = i === 0 ? '' : `_${i}`;
        const candidate = `${base}${suffix}@clist.local`;
        const existing = await prisma.user.findUnique({
            where: { email: candidate },
            select: { id: true }
        });
        if (!existing) {
            return candidate;
        }
    }

    throw createError({ statusCode: 500, message: 'Unable to allocate email for Clist user' });
}

async function findOrCreateLocalUser(identity: {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
    oauthCredentials: ClistOAuthCredentialSnapshot;
}) {
    const linked = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'clist',
                platformUid: identity.platformUid
            }
        },
        include: { user: true }
    });

    if (linked) {
        await prisma.linkedAccount.update({
            where: { id: linked.id },
            data: {
                platformUsername: identity.platformUsername,
                oauthAccessToken: identity.oauthCredentials.oauthAccessToken,
                oauthRefreshToken: identity.oauthCredentials.oauthRefreshToken,
                oauthTokenType: identity.oauthCredentials.oauthTokenType,
                oauthExpiresAt: identity.oauthCredentials.oauthExpiresAt,
                oauthScope: identity.oauthCredentials.oauthScope
            }
        });

        return linked.user;
    }

    let user = null;
    const normalizedEmail = normalizeUsername(identity.email);
    if (normalizedEmail) {
        user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    }

    if (!user) {
        const username = await getClistUniqueUsername(
            identity.platformUsername || `clist_${identity.platformUid}`
        );
        const userCount = await prisma.user.count();
        const role = userCount === 0 ? 'admin' : 'user';
        const email = normalizedEmail || (await allocateSyntheticEmail(identity.platformUid));

        user = await prisma.user.create({
            data: {
                email,
                username,
                passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
                displayName: identity.displayName,
                avatarUrl: identity.avatarUrl,
                emailVerified: normalizedEmail ? identity.emailVerified : false,
                role
            }
        });

        logger.info(`Created local user from Clist: user=${user.id}, username=${user.username}`);
    }

    await prisma.linkedAccount.upsert({
        where: {
            userId_platform: {
                userId: user.id,
                platform: 'clist'
            }
        },
        update: {
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthAccessToken: identity.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: identity.oauthCredentials.oauthRefreshToken,
            oauthTokenType: identity.oauthCredentials.oauthTokenType,
            oauthExpiresAt: identity.oauthCredentials.oauthExpiresAt,
            oauthScope: identity.oauthCredentials.oauthScope
        },
        create: {
            userId: user.id,
            platform: 'clist',
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthAccessToken: identity.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: identity.oauthCredentials.oauthRefreshToken,
            oauthTokenType: identity.oauthCredentials.oauthTokenType,
            oauthExpiresAt: identity.oauthCredentials.oauthExpiresAt,
            oauthScope: identity.oauthCredentials.oauthScope
        }
    });

    return user;
}

async function registerLocalUserFromClist(identity: {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
    oauthCredentials: ClistOAuthCredentialSnapshot;
}) {
    const linked = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'clist',
                platformUid: identity.platformUid
            }
        },
        select: { id: true }
    });
    if (linked) {
        throw createError({
            statusCode: 409,
            message: 'This Clist account has already registered'
        });
    }

    const normalizedEmail = normalizeUsername(identity.email);
    if (normalizedEmail) {
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true }
        });
        if (existingUser) {
            throw createError({ statusCode: 409, message: 'Email already exists' });
        }
    }

    const username = await getClistUniqueUsername(
        identity.platformUsername || `clist_${identity.platformUid}`
    );
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'admin' : 'user';
    const email = normalizedEmail || (await allocateSyntheticEmail(identity.platformUid));

    const user = await prisma.user.create({
        data: {
            email,
            username,
            passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            emailVerified: normalizedEmail ? identity.emailVerified : false,
            role
        },
        select: {
            id: true,
            username: true,
            email: true
        }
    });

    await prisma.linkedAccount.create({
        data: {
            userId: user.id,
            platform: 'clist',
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthAccessToken: identity.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: identity.oauthCredentials.oauthRefreshToken,
            oauthTokenType: identity.oauthCredentials.oauthTokenType,
            oauthExpiresAt: identity.oauthCredentials.oauthExpiresAt,
            oauthScope: identity.oauthCredentials.oauthScope
        }
    });

    return user;
}

async function bindClistToExistingUser(params: {
    userId: string;
    platformUid: string;
    platformUsername: string;
    oauthCredentials: ClistOAuthCredentialSnapshot;
}) {
    const targetUser = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { id: true, username: true, email: true }
    });
    if (!targetUser) {
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    const existingByPlatform = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'clist',
                platformUid: params.platformUid
            }
        },
        select: {
            id: true,
            userId: true
        }
    });

    if (existingByPlatform && existingByPlatform.userId !== params.userId) {
        throw createError({
            statusCode: 409,
            message: 'This Clist account is already linked by another user'
        });
    }

    const existingForUser = await prisma.linkedAccount.findUnique({
        where: {
            userId_platform: {
                userId: params.userId,
                platform: 'clist'
            }
        },
        select: {
            id: true,
            platformUid: true
        }
    });

    if (existingForUser) {
        throw createError({
            statusCode: 409,
            message: 'You have already linked a Clist account'
        });
    }

    await prisma.linkedAccount.upsert({
        where: {
            userId_platform: {
                userId: params.userId,
                platform: 'clist'
            }
        },
        update: {
            platformUid: params.platformUid,
            platformUsername: params.platformUsername,
            oauthAccessToken: params.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: params.oauthCredentials.oauthRefreshToken,
            oauthTokenType: params.oauthCredentials.oauthTokenType,
            oauthExpiresAt: params.oauthCredentials.oauthExpiresAt,
            oauthScope: params.oauthCredentials.oauthScope
        },
        create: {
            userId: params.userId,
            platform: 'clist',
            platformUid: params.platformUid,
            platformUsername: params.platformUsername,
            oauthAccessToken: params.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: params.oauthCredentials.oauthRefreshToken,
            oauthTokenType: params.oauthCredentials.oauthTokenType,
            oauthExpiresAt: params.oauthCredentials.oauthExpiresAt,
            oauthScope: params.oauthCredentials.oauthScope
        }
    });

    return targetUser;
}

export default defineEventHandler(async event => {
    const body = await readBody<CallbackBody>(event);
    if (!body.code || !body.state) {
        throw createError({ statusCode: 400, message: 'Missing code or state' });
    }

    const stateKey = `oauth:clist:state:${body.state}`;
    const cachedState = await getRedis().get(stateKey);
    if (!cachedState) {
        throw createError({ statusCode: 400, message: 'Invalid or expired OAuth state' });
    }
    await getRedis().del(stateKey);

    const statePayload = JSON.parse(cachedState) as {
        mode?: ClistOAuthMode;
        bindUserId?: string | null;
        redirectAfterLogin?: string;
        codeVerifier?: string;
    };
    const mode: ClistOAuthMode =
        statePayload.mode === 'bind' || statePayload.mode === 'register'
            ? statePayload.mode
            : 'login';
    const redirectAfterLogin =
        typeof statePayload.redirectAfterLogin === 'string' &&
        statePayload.redirectAfterLogin.startsWith('/')
            ? statePayload.redirectAfterLogin
            : '/';
    const codeVerifier = statePayload.codeVerifier;
    if (!codeVerifier) {
        throw createError({ statusCode: 400, message: 'Missing PKCE code verifier' });
    }

    const clientId = (await getConfig('clist_client_id')).trim();
    const clientSecret = (await getConfig('clist_client_secret')).trim();
    if (!clientId || !clientSecret) {
        throw createError({ statusCode: 503, message: 'Clist login is not configured' });
    }

    const redirectUri = `${getRequestURL(event).origin}/oauth/thirdparty/clist`;
    const token = await exchangeClistAuthorizationCode({
        code: body.code,
        clientId,
        clientSecret,
        redirectUri,
        codeVerifier
    });
    const identity = await resolveClistIdentity(token.access_token);
    const oauthCredentials = buildClistOAuthCredentialSnapshot(token);

    if (mode === 'bind') {
        const bindUserId = statePayload.bindUserId;
        if (!bindUserId) {
            throw createError({ statusCode: 400, message: 'Invalid bind state' });
        }
        const user = await bindClistToExistingUser({
            userId: bindUserId,
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthCredentials
        });

        logger.success(`Clist bind success: clist=${identity.platformUid}, user=${user.id}`);

        return {
            mode: 'bind',
            redirect: redirectAfterLogin,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        };
    }

    if (mode === 'register') {
        const user = await registerLocalUserFromClist({
            ...identity,
            oauthCredentials
        });
        const authToken = await signAuthToken(user.id);

        logger.success(`Clist register success: clist=${identity.platformUid}, user=${user.id}`);

        return {
            mode: 'register',
            token: authToken,
            redirect: redirectAfterLogin,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        };
    }

    const user = await findOrCreateLocalUser({ ...identity, oauthCredentials });

    const authToken = await signAuthToken(user.id);

    logger.success(`Clist login success: clist=${identity.platformUid}, user=${user.id}`);

    return {
        mode: 'login',
        token: authToken,
        redirect: redirectAfterLogin,
        user: {
            id: user.id,
            username: user.username,
            email: user.email
        }
    };
});
