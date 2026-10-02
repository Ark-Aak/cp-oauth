import { createError } from 'h3';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '~/utils/username';
import prisma from './prisma';

export async function getUniqueUsername(base: string): Promise<string> {
    const normalized = base
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    const clipped = (normalized || 'cp_user').slice(0, USERNAME_MAX_LENGTH);
    const stem = clipped.padEnd(USERNAME_MIN_LENGTH, 'x');
    for (let i = 0; i <= 9999; i += 1) {
        const suffix = i ? `_${i}` : '';
        const candidate = `${stem.slice(0, USERNAME_MAX_LENGTH - suffix.length)}${suffix}`;
        const existing = await prisma.user.findUnique({
            where: { username: candidate },
            select: { id: true }
        });
        if (!existing) return candidate;
    }
    throw createError({ statusCode: 409, message: 'No available username for this account' });
}

export async function getSyntheticEmail(platform: string, platformUid: string): Promise<string> {
    const stem = `${platform}_${platformUid.replace(/[^a-zA-Z0-9_]/g, '_')}`
        .toLowerCase()
        .slice(0, 40);
    for (let i = 0; i <= 9999; i += 1) {
        const candidate = `${stem}${i ? `_${i}` : ''}@${platform}.local`;
        const existing = await prisma.user.findUnique({
            where: { email: candidate },
            select: { id: true }
        });
        if (!existing) return candidate;
    }
    throw createError({ statusCode: 409, message: 'No available email for this account' });
}
