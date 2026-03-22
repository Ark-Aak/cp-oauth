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
    displayName: string | null;
    avatarUrl: string | null;
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
                emailVerified: Boolean(normalizedEmail),
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
            platformUsername: identity.platformUsername
        },
        create: {
            userId: user.id,
            platform: 'codeforces',
            platformUid: identity.platformUid,
            platformUsername: identity.platformUsername
        }
    });

    return user;
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

    const statePayload = JSON.parse(cachedState) as { redirectAfterLogin?: string };
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
    const user = await findOrCreateLocalUser(identity);

    const config = useRuntimeConfig();
    const authToken = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

    logger.success(`Codeforces login success: cf=${identity.platformUid}, user=${user.id}`);

    return {
        token: authToken,
        redirect: redirectAfterLogin,
        user: {
            id: user.id,
            username: user.username,
            email: user.email
        }
    };
});
