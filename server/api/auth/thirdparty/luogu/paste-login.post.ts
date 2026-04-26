import jwt from 'jsonwebtoken';
import prisma from '~/server/utils/prisma';
import { fetchLuoguPaste } from '~/server/utils/fetch-luogu';
import { verifyTurnstileToken } from '~/server/utils/turnstile';
import {
    extractLuoguCredentialTokens,
    findFirstValidLuoguCredential
} from '~/server/utils/luogu-login-credential';

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const pasteId = String(body.pasteId || '').trim();
    const turnstileToken = String(body.turnstileToken || '');

    await verifyTurnstileToken({
        token: turnstileToken,
        action: 'luogu:paste-login'
    });

    if (!pasteId) {
        throw createError({ statusCode: 400, message: 'Clipboard ID is required' });
    }

    const paste = await fetchLuoguPaste(pasteId);
    if (!paste) {
        throw createError({ statusCode: 404, message: 'Clipboard not found' });
    }
    if (!paste.isPublic) {
        throw createError({ statusCode: 400, message: 'Clipboard is not public' });
    }

    const tokens = extractLuoguCredentialTokens(paste.data);
    if (tokens.length === 0) {
        throw createError({ statusCode: 401, message: 'No valid credential found in clipboard' });
    }

    const credential = await findFirstValidLuoguCredential({
        tokens,
        expectedPlatformUid: paste.ownerUid
    });

    if (!credential) {
        throw createError({
            statusCode: 401,
            message: 'No active credential matched this clipboard'
        });
    }

    const stillLinked = await prisma.linkedAccount.findUnique({
        where: {
            userId_platform: {
                userId: credential.userId,
                platform: 'luogu'
            }
        },
        select: {
            userId: true,
            platformUid: true,
            platformUsername: true
        }
    });

    if (!stillLinked || stillLinked.platformUid !== paste.ownerUid) {
        throw createError({ statusCode: 401, message: 'Linked Luogu account mismatch' });
    }

    const user = await prisma.user.findUnique({
        where: { id: credential.userId },
        select: { id: true, username: true, email: true }
    });

    if (!user) {
        throw createError({ statusCode: 404, message: 'User not found' });
    }

    const config = useRuntimeConfig();
    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

    return {
        token,
        user,
        loginMethod: 'luogu-paste'
    };
});
