import crypto from 'crypto';
import { getPlatformVerifier } from '~/server/utils/platforms';
import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';
import { verifyTurnstileToken } from '~/server/utils/turnstile';

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const platformUid = String(body.platformUid || '').trim();
    const turnstileToken = String(body.turnstileToken || '');

    await verifyTurnstileToken({
        token: turnstileToken,
        action: 'leetcode:register:request'
    });

    if (!platformUid) {
        throw createError({ statusCode: 400, message: 'Platform UID is required' });
    }

    const verifier = getPlatformVerifier('leetcode');
    if (!verifier) {
        throw createError({ statusCode: 500, message: 'LeetCode verifier is unavailable' });
    }

    const taken = await prisma.linkedAccount.findUnique({
        where: {
            platform_platformUid: {
                platform: 'leetcode',
                platformUid
            }
        },
        select: { id: true }
    });
    if (taken) {
        throw createError({
            statusCode: 409,
            message: 'This LeetCode account is already linked by another user'
        });
    }

    const requestId = crypto.randomBytes(12).toString('hex');
    const code = `CPOAUTH-REG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    await getRedis().set(
        `auth:leetcode:register:${requestId}`,
        JSON.stringify({ code, platformUid }),
        'EX',
        600
    );

    return {
        requestId,
        code,
        expiresIn: 600
    };
});
