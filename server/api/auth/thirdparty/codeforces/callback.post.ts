import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { consola } from 'consola';
import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';
import { getConfig } from '~/server/utils/config';
import {
    exchangeCodeforcesAuthorizationCode,
    getUniqueUsername,
    resolveCodeforcesIdentity
} from '~/server/utils/codeforces-oauth';

const logger = consola.withTag('auth:codeforces:callback');

interface CallbackBody {
    code?: string;
    state?: string;
}

type CodeforcesOAuthMode = 'login' | 'bind' | 'register';

interface CodeforcesOAuthCredentialSnapshot {
    oauthAccessToken: string;
    oauthRefreshToken: string | null;
    oauthIdToken: string | null;
    oauthTokenType: string | null;
    oauthExpiresAt: Date | null;
    oauthScope: string | null;
}

function buildCodeforcesOAuthCredentialSnapshot(token: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
}): CodeforcesOAuthCredentialSnapshot {
    const expiresAt =
        typeof token.expires_in === 'number' && Number.isFinite(token.expires_in)
            ? new Date(Date.now() + token.expires_in * 1000)
            : null;

    return {
        oauthAccessToken: token.access_token,
        oauthRefreshToken: token.refresh_token || null,
        oauthIdToken: token.id_token || null,
        oauthTokenType: token.token_type || null,
        oauthExpiresAt: expiresAt,
        oauthScope: token.scope || null
    };
}

async function allocateSyntheticEmail(platformUid: string): Promise<string> {
    const base = `cf_${platformUid.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 40);
    for (let i = 0; i <= 9999; i += 1) {
        const suffix = i === 0 ? '' : `_${i}`;
        const candidate = `${base}${suffix}@codeforces.local`;
        const existing = await prisma.user.findUnique({
            where: { email: candidate },
            select: { id: true }
        });
        if (!existing) {
            return candidate;
        }
    }

    throw createError({ statusCode: 500, message: 'Unable to allocate email for Codeforces user' });
}

async function findOrCreateLocalUser(identity: {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
    oauthCredentials: CodeforcesOAuthCredentialSnapshot;
}) {
    const linked = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'codeforces',
                platformUid: identity.platformUid
            }
        },
        include: { user: true }
    });

    if (linked) {
        return linked.user;
    }

    let user = null;
    const normalizedEmail = identity.email?.toLowerCase().trim() || null;
    if (normalizedEmail) {
        user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    }

    if (!user) {
        const username = await getUniqueUsername(
            identity.platformUsername || `cf_${identity.platformUid}`
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

        logger.info(
            `Created local user from Codeforces: user=${user.id}, username=${user.username}`
        );
    }

    await prisma.linkedAccount.upsert({
        where: {
            userId_platform: {
                userId: user.id,
                platform: 'codeforces'
            }
        },
        update: {
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthAccessToken: identity.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: identity.oauthCredentials.oauthRefreshToken,
            oauthIdToken: identity.oauthCredentials.oauthIdToken,
            oauthTokenType: identity.oauthCredentials.oauthTokenType,
            oauthExpiresAt: identity.oauthCredentials.oauthExpiresAt,
            oauthScope: identity.oauthCredentials.oauthScope
        },
        create: {
            userId: user.id,
            platform: 'codeforces',
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthAccessToken: identity.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: identity.oauthCredentials.oauthRefreshToken,
            oauthIdToken: identity.oauthCredentials.oauthIdToken,
            oauthTokenType: identity.oauthCredentials.oauthTokenType,
            oauthExpiresAt: identity.oauthCredentials.oauthExpiresAt,
            oauthScope: identity.oauthCredentials.oauthScope
        }
    });

    return user;
}

async function registerLocalUserFromCodeforces(identity: {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
    oauthCredentials: CodeforcesOAuthCredentialSnapshot;
}) {
    const linked = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'codeforces',
                platformUid: identity.platformUid
            }
        },
        select: { id: true }
    });
    if (linked) {
        throw createError({
            statusCode: 409,
            message: 'This Codeforces account has already registered'
        });
    }

    const normalizedEmail = identity.email?.toLowerCase().trim() || null;
    if (normalizedEmail) {
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true }
        });
        if (existingUser) {
            throw createError({ statusCode: 409, message: 'Email already exists' });
        }
    }

    const username = await getUniqueUsername(
        identity.platformUsername || `cf_${identity.platformUid}`
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
            platform: 'codeforces',
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthAccessToken: identity.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: identity.oauthCredentials.oauthRefreshToken,
            oauthIdToken: identity.oauthCredentials.oauthIdToken,
            oauthTokenType: identity.oauthCredentials.oauthTokenType,
            oauthExpiresAt: identity.oauthCredentials.oauthExpiresAt,
            oauthScope: identity.oauthCredentials.oauthScope
        }
    });

    return user;
}

async function bindCodeforcesToExistingUser(params: {
    userId: string;
    platformUid: string;
    platformUsername: string;
    oauthCredentials: CodeforcesOAuthCredentialSnapshot;
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
                platform: 'codeforces',
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
            message: 'This Codeforces account is already linked by another user'
        });
    }

    const existingForUser = await prisma.linkedAccount.findUnique({
        where: {
            userId_platform: {
                userId: params.userId,
                platform: 'codeforces'
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
            message: 'You have already linked a Codeforces account'
        });
    }

    await prisma.linkedAccount.upsert({
        where: {
            userId_platform: {
                userId: params.userId,
                platform: 'codeforces'
            }
        },
        update: {
            platformUid: params.platformUid,
            platformUsername: params.platformUsername,
            oauthAccessToken: params.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: params.oauthCredentials.oauthRefreshToken,
            oauthIdToken: params.oauthCredentials.oauthIdToken,
            oauthTokenType: params.oauthCredentials.oauthTokenType,
            oauthExpiresAt: params.oauthCredentials.oauthExpiresAt,
            oauthScope: params.oauthCredentials.oauthScope
        },
        create: {
            userId: params.userId,
            platform: 'codeforces',
            platformUid: params.platformUid,
            platformUsername: params.platformUsername,
            oauthAccessToken: params.oauthCredentials.oauthAccessToken,
            oauthRefreshToken: params.oauthCredentials.oauthRefreshToken,
            oauthIdToken: params.oauthCredentials.oauthIdToken,
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

    const stateKey = `oauth:codeforces:state:${body.state}`;
    const cachedState = await getRedis().get(stateKey);
    if (!cachedState) {
        throw createError({ statusCode: 400, message: 'Invalid or expired OAuth state' });
    }
    await getRedis().del(stateKey);

    const statePayload = JSON.parse(cachedState) as {
        mode?: CodeforcesOAuthMode;
        bindUserId?: string | null;
        redirectAfterLogin?: string;
    };
    const mode: CodeforcesOAuthMode =
        statePayload.mode === 'bind' || statePayload.mode === 'register'
            ? statePayload.mode
            : 'login';
    const redirectAfterLogin =
        typeof statePayload.redirectAfterLogin === 'string' &&
        statePayload.redirectAfterLogin.startsWith('/')
            ? statePayload.redirectAfterLogin
            : '/';

    const clientId = (await getConfig('codeforces_client_id')).trim();
    const clientSecret = (await getConfig('codeforces_client_secret')).trim();
    if (!clientId || !clientSecret) {
        throw createError({ statusCode: 503, message: 'Codeforces login is not configured' });
    }

    const redirectUri = `${getRequestURL(event).origin}/oauth/thirdparty/codeforces`;
    const { token, discovery } = await exchangeCodeforcesAuthorizationCode({
        code: body.code,
        clientId,
        clientSecret,
        redirectUri
    });
    const identity = await resolveCodeforcesIdentity({ token, discovery });
    const oauthCredentials = buildCodeforcesOAuthCredentialSnapshot(token);

    if (mode === 'bind') {
        const bindUserId = statePayload.bindUserId;
        if (!bindUserId) {
            throw createError({ statusCode: 400, message: 'Invalid bind state' });
        }
        const user = await bindCodeforcesToExistingUser({
            userId: bindUserId,
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthCredentials
        });

        logger.success(`Codeforces bind success: cf=${identity.platformUid}, user=${user.id}`);

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
        const user = await registerLocalUserFromCodeforces({
            ...identity,
            oauthCredentials
        });
        const config = useRuntimeConfig();
        const authToken = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

        logger.success(`Codeforces register success: cf=${identity.platformUid}, user=${user.id}`);

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

    const config = useRuntimeConfig();
    const authToken = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

    logger.success(`Codeforces login success: cf=${identity.platformUid}, user=${user.id}`);

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
