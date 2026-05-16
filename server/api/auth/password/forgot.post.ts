import crypto from 'crypto';
import prisma from '~/server/utils/prisma';
import { sendPasswordResetEmail } from '~/server/utils/mailer';
import { getPublicBaseUrl } from '~/server/utils/base-url';

export default defineEventHandler(async event => {
    const body = await readBody(event);
    const email = String(body?.email || '')
        .trim()
        .toLowerCase();

    if (!email) {
        throw createError({ statusCode: 400, message: 'Email is required' });
    }

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true }
    });
    if (!user) {
        return { success: true };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            passwordResetToken: token,
            passwordResetExpiresAt: expiresAt
        }
    });

    await sendPasswordResetEmail(user.email, token, getPublicBaseUrl());

    return { success: true };
});
