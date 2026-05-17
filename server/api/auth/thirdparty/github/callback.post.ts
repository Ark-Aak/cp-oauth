import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';
import { getConfig } from '~/server/utils/config';
import { getRedis } from '~/server/utils/redis';
import {
    exchangeGitHubAuthorizationCode,
    resolveGitHubIdentity
} from '~/server/utils/github-oauth';
import { getUniqueUsername } from '~/server/utils/codeforces-oauth';
import { fetchPlatformUsername } from '~/server/utils/platform-username';
import { createAuthUserResponse } from '~/server/utils/user-response';
import { createUserWithInitialRole } from '~/server/utils/role';

interface GitHubTokenPayload {
    accessToken: string;
    tokenType?: string;
    scope?: string;
}

interface CallbackBody {
    code?: string;
    state?: string;
}

type GitHubOAuthMode = 'login' | 'bind' | 'register';

async function allocateSyntheticEmail(platformUid: string): Promise<string> {
    const base = `gh_${platformUid.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 40);
    for (let i = 0; i <= 9999; i += 1) {
        const suffix = i === 0 ? '' : `_${i}`;
        const candidate = `${base}${suffix}@github.local`;
        const existing = await prisma.user.findUnique({
            where: { email: candidate },
            select: { id: true }
        });
        if (!existing) return candidate;
    }
    throw createError({ statusCode: 500, message: 'Unable to allocate email for GitHub user' });
}

async function findOrCreateLocalUser(
    identity: {
        platformUid: string;
        platformUsername: string;
        email: string | null;
        emailVerified: boolean;
        displayName: string | null;
        avatarUrl: string | null;
    },
    token: GitHubTokenPayload
) {
    const linked = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'github',
                platformUid: identity.platformUid
            }
        },
        include: { user: true }
    });

    if (linked) return linked.user;

    let user = null;
    const normalizedEmail = normalizeUsername(identity.email);
    if (normalizedEmail) {
        user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    }

    if (!user) {
        const username = await getUniqueUsername(
            identity.platformUsername || `gh_${identity.platformUid}`
        );
        const email = normalizedEmail || (await allocateSyntheticEmail(identity.platformUid));

        user = await createUserWithInitialRole({
            data: {
                email,
                username,
                passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
                displayName: identity.displayName,
                avatarUrl: identity.avatarUrl,
                emailVerified: normalizedEmail ? identity.emailVerified : false
            }
        });
    }

    await prisma.linkedAccount.upsert({
        where: {
            userId_platform: {
                userId: user.id,
                platform: 'github'
            }
        },
        update: {
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthAccessToken: token.accessToken,
            oauthTokenType: token.tokenType || 'bearer',
            oauthScope: token.scope || null
        },
        create: {
            userId: user.id,
            platform: 'github',
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthAccessToken: token.accessToken,
            oauthTokenType: token.tokenType || 'bearer',
            oauthScope: token.scope || null
        }
    });

    return user;
}

async function registerLocalUserFromGitHub(
    identity: {
        platformUid: string;
        platformUsername: string;
        email: string | null;
        emailVerified: boolean;
        displayName: string | null;
        avatarUrl: string | null;
    },
    token: GitHubTokenPayload
) {
    const linked = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'github',
                platformUid: identity.platformUid
            }
        },
        select: { id: true }
    });
    if (linked) {
        throw createError({
            statusCode: 409,
            message: 'This GitHub account has already registered'
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

    const username = await getUniqueUsername(
        identity.platformUsername || `gh_${identity.platformUid}`
    );
    const email = normalizedEmail || (await allocateSyntheticEmail(identity.platformUid));

    const user = await createUserWithInitialRole({
        data: {
            email,
            username,
            passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            emailVerified: normalizedEmail ? identity.emailVerified : false
        },
        select: { id: true, username: true, displayName: true, email: true }
    });

    await prisma.linkedAccount.create({
        data: {
            userId: user.id,
            platform: 'github',
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            oauthAccessToken: token.accessToken,
            oauthTokenType: token.tokenType || 'bearer',
            oauthScope: token.scope || null
        }
    });

    return user;
}

async function bindGitHubToExistingUser(params: {
    userId: string;
    platformUid: string;
    platformUsername: string;
    token: GitHubTokenPayload;
}) {
    const targetUser = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { id: true, username: true, displayName: true, email: true }
    });
    if (!targetUser) throw createError({ statusCode: 404, message: 'User not found' });

    const existingByPlatform = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'github',
                platformUid: params.platformUid
            }
        },
        select: { id: true, userId: true }
    });
    if (existingByPlatform && existingByPlatform.userId !== params.userId) {
        throw createError({
            statusCode: 409,
            message: 'This GitHub account is already linked by another user'
        });
    }

    const existingForUser = await prisma.linkedAccount.findUnique({
        where: {
            userId_platform: {
                userId: params.userId,
                platform: 'github'
            }
        },
        select: { id: true }
    });
    if (existingForUser) {
        throw createError({ statusCode: 409, message: 'You have already linked a GitHub account' });
    }

    await prisma.linkedAccount.upsert({
        where: {
            userId_platform: {
                userId: params.userId,
                platform: 'github'
            }
        },
        update: {
            platformUid: params.platformUid,
            platformUsername: params.platformUsername,
            oauthAccessToken: params.token.accessToken,
            oauthTokenType: params.token.tokenType || 'bearer',
            oauthScope: params.token.scope || null
        },
        create: {
            userId: params.userId,
            platform: 'github',
            platformUid: params.platformUid,
            platformUsername: params.platformUsername,
            oauthAccessToken: params.token.accessToken,
            oauthTokenType: params.token.tokenType || 'bearer',
            oauthScope: params.token.scope || null
        }
    });

    return targetUser;
}

export default defineEventHandler(async event => {
    const body = await readBody<CallbackBody>(event);
    if (!body.code || !body.state) {
        throw createError({ statusCode: 400, message: 'Missing code or state' });
    }

    const stateKey = `oauth:github:state:${body.state}`;
    const cachedState = (await getRedis().getdel(stateKey)) as string | null;
    if (!cachedState) {
        throw createError({ statusCode: 400, message: 'Invalid or expired OAuth state' });
    }

    const statePayload = JSON.parse(cachedState) as {
        mode?: GitHubOAuthMode;
        bindUserId?: string | null;
        redirectAfterLogin?: string;
    };

    const mode: GitHubOAuthMode =
        statePayload.mode === 'bind' || statePayload.mode === 'register'
            ? statePayload.mode
            : 'login';
    const redirectAfterLogin =
        typeof statePayload.redirectAfterLogin === 'string' &&
        statePayload.redirectAfterLogin.startsWith('/')
            ? statePayload.redirectAfterLogin
            : '/';

    const clientId = (await getConfig('github_client_id')).trim();
    const clientSecret = (await getConfig('github_client_secret')).trim();
    if (!clientId || !clientSecret) {
        throw createError({ statusCode: 503, message: 'GitHub login is not configured' });
    }

    const redirectUri = `${getRequestURL(event).origin}/oauth/thirdparty/github`;
    const token = await exchangeGitHubAuthorizationCode({
        code: body.code,
        clientId,
        clientSecret,
        redirectUri
    });
    const identity = await resolveGitHubIdentity(token.access_token);
    const githubToken: GitHubTokenPayload = {
        accessToken: token.access_token,
        tokenType: token.token_type,
        scope: token.scope
    };

    if (mode === 'bind') {
        const bindUserId = statePayload.bindUserId;
        if (!bindUserId) {
            throw createError({ statusCode: 400, message: 'Invalid bind state' });
        }

        const user = await bindGitHubToExistingUser({
            userId: bindUserId,
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername,
            token: githubToken
        });

        // Keep GitHub username fresh as soon as the account is linked.
        const refreshedUsername = await fetchPlatformUsername('github', {
            platformUid: identity.platformUid,
            oauthAccessToken: githubToken.accessToken,
            oauthTokenType: githubToken.tokenType || null
        });
        if (refreshedUsername) {
            await prisma.linkedAccount.update({
                where: {
                    userId_platform: {
                        userId: bindUserId,
                        platform: 'github'
                    }
                },
                data: {
                    platformUsername: refreshedUsername
                }
            });
        }

        return {
            mode: 'bind',
            redirect: redirectAfterLogin,
            user: createAuthUserResponse(user)
        };
    }

    if (mode === 'register') {
        const user = await registerLocalUserFromGitHub(identity, githubToken);
        const refreshedUsername = await fetchPlatformUsername('github', {
            platformUid: identity.platformUid,
            oauthAccessToken: githubToken.accessToken,
            oauthTokenType: githubToken.tokenType || null
        });
        if (refreshedUsername) {
            await prisma.linkedAccount.update({
                where: {
                    userId_platform: {
                        userId: user.id,
                        platform: 'github'
                    }
                },
                data: {
                    platformUsername: refreshedUsername
                }
            });
        }
        const authToken = await signAuthToken(user.id);

        return {
            mode: 'register',
            token: authToken,
            redirect: redirectAfterLogin,
            user: createAuthUserResponse(user)
        };
    }

    const user = await findOrCreateLocalUser(identity, githubToken);
    const refreshedUsername = await fetchPlatformUsername('github', {
        platformUid: identity.platformUid,
        oauthAccessToken: githubToken.accessToken,
        oauthTokenType: githubToken.tokenType || null
    });
    if (refreshedUsername) {
        await prisma.linkedAccount.update({
            where: {
                userId_platform: {
                    userId: user.id,
                    platform: 'github'
                }
            },
            data: {
                platformUsername: refreshedUsername
            }
        });
    }
    const authToken = await signAuthToken(user.id);

    return {
        mode: 'login',
        token: authToken,
        redirect: redirectAfterLogin,
        user: createAuthUserResponse(user)
    };
});
