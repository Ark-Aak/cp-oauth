import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPlatformVerifier } from '~/server/utils/platforms';
import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';
import { getUniqueUsername } from '~/server/utils/codeforces-oauth';

async function allocateSyntheticLuoguEmail(platformUid: string): Promise<string> {
    const base = `luogu_${platformUid.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 40);
    for (let i = 0; i <= 9999; i += 1) {
        const suffix = i === 0 ? '' : `_${i}`;
        const candidate = `${base}${suffix}@luogu.local`;
        const exists = await prisma.user.findUnique({
            where: { email: candidate },
            select: { id: true }
        });
        if (!exists) {
            return candidate;
        }
    }
    throw createError({ statusCode: 500, message: 'Unable to allocate email for Luogu user' });
}

function getDefaultLuoguAvatarUrl(uid: string): string {
    return `https://cdn.luogu.com.cn/upload/usericon/${encodeURIComponent(uid)}.png`;
}

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const requestId = String(body.requestId || '').trim();
    const credential = String(body.credential || '').trim();

    if (!requestId || !credential) {
        throw createError({ statusCode: 400, message: 'requestId and credential are required' });
    }

    const redis = getRedis();
    const key = `auth:luogu:register:${requestId}`;
    const raw = await redis.get(key);
    if (!raw) {
        throw createError({
            statusCode: 400,
            message: 'Registration request expired or not found'
        });
    }

    const { code, platformUid } = JSON.parse(raw) as { code: string; platformUid: string };

    const verifier = getPlatformVerifier('luogu');
    if (!verifier) {
        throw createError({ statusCode: 500, message: 'Luogu verifier is unavailable' });
    }

    const result = await verifier.verify({ platformUid, code, credential });
    if (!result.success) {
        throw createError({ statusCode: 400, message: result.error || 'Verification failed' });
    }

    const taken = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'luogu',
                platformUid: result.platformUid
            }
        },
        select: { id: true }
    });
    if (taken) {
        throw createError({
            statusCode: 409,
            message: 'This Luogu account has already registered'
        });
    }

    const username = await getUniqueUsername(
        result.platformUsername || `luogu_${result.platformUid}`
    );
    const email = await allocateSyntheticLuoguEmail(result.platformUid);
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'admin' : 'user';

    const user = await prisma.user.create({
        data: {
            email,
            username,
            passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
            displayName: result.platformUsername || null,
            avatarUrl: getDefaultLuoguAvatarUrl(result.platformUid),
            emailVerified: false,
            role
        },
        select: { id: true, username: true, email: true }
    });

    await prisma.linkedAccount.create({
        data: {
            userId: user.id,
            platform: 'luogu',
            platformUid: result.platformUid,
            platformUsername: result.platformUsername || null
        }
    });

    await redis.del(key);

    const config = useRuntimeConfig();
    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

    return {
        token,
        user,
        mode: 'register'
    };
});
