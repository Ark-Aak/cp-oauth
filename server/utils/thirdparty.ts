import bcrypt from 'bcryptjs';
import prisma from '~/server/utils/prisma';
import { normalizeUsername } from '~/utils/username';

export interface LinkedAccountOAuthFields {
    oauthAccessToken?: string | null;
    oauthRefreshToken?: string | null;
    oauthIdToken?: string | null;
    oauthTokenType?: string | null;
    oauthExpiresAt?: Date | null;
    oauthScope?: string | null;
}

export interface FindOrCreateLocalUserOptions {
    platform: string;
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
    usernamePrefix: string;
    oauthFields?: LinkedAccountOAuthFields;
    /** If true, update OAuth fields on linkedAccount even when user already linked */
    refreshOnFound?: boolean;
    /** Custom username generator (overrides default getUniqueUsername with prefix) */
    getUniqueUsername?: (base: string) => Promise<string>;
    /** Synthetic email allocator for users without email */
    allocateSyntheticEmail?: (platformUid: string) => Promise<string>;
    /** Logger for created user event */
    logger?: { info: (msg: string) => void };
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
        oauthFields,
        refreshOnFound = false,
        getUniqueUsername: customGetUsername,
        allocateSyntheticEmail: customAllocEmail,
        logger
    } = opts;

    const linked = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform,
                platformUid
            }
        },
        include: { user: true }
    });

    if (linked) {
        if (refreshOnFound && oauthFields) {
            const updateData: Record<string, unknown> = {
                platformUsername
            };
            if (oauthFields.oauthAccessToken !== undefined) updateData.oauthAccessToken = oauthFields.oauthAccessToken;
            if (oauthFields.oauthRefreshToken !== undefined) updateData.oauthRefreshToken = oauthFields.oauthRefreshToken;
            if (oauthFields.oauthIdToken !== undefined) updateData.oauthIdToken = oauthFields.oauthIdToken;
            if (oauthFields.oauthTokenType !== undefined) updateData.oauthTokenType = oauthFields.oauthTokenType;
            if (oauthFields.oauthExpiresAt !== undefined) updateData.oauthExpiresAt = oauthFields.oauthExpiresAt;
            if (oauthFields.oauthScope !== undefined) updateData.oauthScope = oauthFields.oauthScope;

            await prisma.linkedAccount.update({
                where: { id: linked.id },
                data: updateData
            });
        }

        return linked.user;
    }

    let user = null;
    const normalizedEmail = normalizeUsername(rawEmail);
    if (normalizedEmail) {
        user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    }

    if (!user) {
        const baseUsername = platformUsername || `${usernamePrefix}${platformUid}`;
        const username = customGetUsername
            ? await customGetUsername(baseUsername)
            : baseUsername;

        const userCount = await prisma.user.count();
        const role = userCount === 0 ? 'admin' : 'user';
        const email = normalizedEmail || (customAllocEmail
            ? await customAllocEmail(platformUid)
            : `${usernamePrefix}${platformUid}@synthetic.local`);

        user = await prisma.user.create({
            data: {
                email,
                username,
                passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
                displayName,
                avatarUrl,
                emailVerified: normalizedEmail ? emailVerified : false,
                role
            }
        });

        logger?.info(`Created local user from ${platform}: user=${user.id}, username=${user.username}`);
    }

    const linkedAccountData: Record<string, unknown> = {
        platformUid,
        platformUsername
    };
    if (oauthFields) {
        if (oauthFields.oauthAccessToken !== undefined) linkedAccountData.oauthAccessToken = oauthFields.oauthAccessToken;
        if (oauthFields.oauthRefreshToken !== undefined) linkedAccountData.oauthRefreshToken = oauthFields.oauthRefreshToken;
        if (oauthFields.oauthIdToken !== undefined) linkedAccountData.oauthIdToken = oauthFields.oauthIdToken;
        if (oauthFields.oauthTokenType !== undefined) linkedAccountData.oauthTokenType = oauthFields.oauthTokenType;
        if (oauthFields.oauthExpiresAt !== undefined) linkedAccountData.oauthExpiresAt = oauthFields.oauthExpiresAt;
        if (oauthFields.oauthScope !== undefined) linkedAccountData.oauthScope = oauthFields.oauthScope;
    }

    await prisma.linkedAccount.upsert({
        where: {
            userId_platform: {
                userId: user.id,
                platform
            }
        },
        update: linkedAccountData,
        create: {
            userId: user.id,
            platform,
            ...linkedAccountData
        }
    });

    return user;
}
