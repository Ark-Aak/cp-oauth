import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';
import { normalizeUsername } from '~/utils/username';

interface FindOrCreateLocalUserOptions {
    platform: string;
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
    usernamePrefix: string;
    getUniqueUsername: (base: string) => Promise<string>;
    allocateSyntheticEmail: (platformUid: string) => Promise<string>;
    logger?: { info: (msg: string) => void };
    /** OAuth fields to store in linkedAccount. If already linked and refreshOnFound is true, these fields are updated. */
    oauthFields?: Record<string, unknown>;
    /** Update linkedAccount OAuth fields when the user is already linked (Codeforces/Clist do this) */
    refreshOnFound?: boolean;
}

export async function findOrCreateLocalUser(opts: FindOrCreateLocalUserOptions) {
    const {
        platform,
        platformUid,
        platformUsername,
        email: rawEmail,
        emailVerified,
        displayName,
        avatarUrl,
        usernamePrefix,
        getUniqueUsername,
        allocateSyntheticEmail,
        logger,
        oauthFields = {},
        refreshOnFound = false
    } = opts;

    const linked = await prisma.linkedAccount.findUnique({
        where: { platform_platformUid: { platform, platformUid } },
        include: { user: true }
    });

    if (linked) {
        if (refreshOnFound) {
            await prisma.linkedAccount.update({
                where: { id: linked.id },
                data: { platformUsername, ...oauthFields }
            });
        }
        return linked.user;
    }

    const normalizedEmail = normalizeUsername(rawEmail);
    let user = normalizedEmail
        ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
        : null;

    if (!user) {
        const baseUsername = platformUsername || `${usernamePrefix}${platformUid}`;
        const username = await getUniqueUsername(baseUsername);
        const userCount = await prisma.user.count();
        const email = normalizedEmail || (await allocateSyntheticEmail(platformUid));

        user = await prisma.user.create({
            data: {
                email,
                username,
                passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
                displayName,
                avatarUrl,
                emailVerified: normalizedEmail ? emailVerified : false,
                role: userCount === 0 ? 'admin' : 'user'
            }
        });

        logger?.info(`Created local user from ${platform}: user=${user.id}, username=${user.username}`);
    }

    await prisma.linkedAccount.upsert({
        where: { userId_platform: { userId: user.id, platform } },
        update: { platformUid, platformUsername, ...oauthFields },
        create: { userId: user.id, platform, platformUid, platformUsername, ...oauthFields }
    });

    return user;
}
