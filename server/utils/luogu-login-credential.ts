import crypto from 'crypto';
import {
    LUOGU_LOGIN_DURATION_SECONDS,
    isValidLuoguLoginDuration as isValidLuoguLoginDurationOption,
    type LuoguLoginDuration
} from '~/utils/luogu-login-credential';
import { getRedis } from './redis';

export type { LuoguLoginDuration } from '~/utils/luogu-login-credential';

export interface LuoguLoginCredentialPayload {
    userId: string;
    platformUid: string;
    platformUsername: string | null;
    expiresAt: number;
}

const TOKEN_PREFIX = 'CPOAUTH-LUOGU-';
const TOKEN_REGEX = /CPOAUTH-LUOGU-[A-Za-z0-9_-]{32,}/g;

function getCredentialKey(token: string): string {
    return `auth:luogu:credential:${token}`;
}

function getActiveCredentialKeyByUser(userId: string): string {
    return `auth:luogu:credential:active:${userId}`;
}

export function isValidLuoguLoginDuration(value: string): value is LuoguLoginDuration {
    return isValidLuoguLoginDurationOption(value);
}

export function extractLuoguCredentialTokens(content: string): string[] {
    const matches = content.match(TOKEN_REGEX) || [];
    return Array.from(new Set(matches));
}

export async function issueLuoguLoginCredential(params: {
    userId: string;
    platformUid: string;
    platformUsername: string | null;
    duration: LuoguLoginDuration;
}): Promise<{ token: string; expiresAt: number; expiresIn: number }> {
    const redis = getRedis();
    const expiresIn = LUOGU_LOGIN_DURATION_SECONDS[params.duration];
    const expiresAt = Date.now() + expiresIn * 1000;
    const token = `${TOKEN_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;

    const payload: LuoguLoginCredentialPayload = {
        userId: params.userId,
        platformUid: params.platformUid,
        platformUsername: params.platformUsername,
        expiresAt
    };

    const activeCredentialKey = getActiveCredentialKeyByUser(params.userId);
    const previousToken = await redis.get(activeCredentialKey);

    const multi = redis.multi();
    if (previousToken) {
        multi.del(getCredentialKey(previousToken));
    }
    multi.set(getCredentialKey(token), JSON.stringify(payload), 'EX', expiresIn);
    multi.set(activeCredentialKey, token, 'EX', expiresIn);
    await multi.exec();

    return { token, expiresAt, expiresIn };
}

export async function findFirstValidLuoguCredential(params: {
    tokens: string[];
    expectedPlatformUid: string;
}): Promise<LuoguLoginCredentialPayload | null> {
    const redis = getRedis();

    for (const token of params.tokens) {
        const raw = await redis.get(getCredentialKey(token));
        if (!raw) {
            continue;
        }

        const payload = JSON.parse(raw) as LuoguLoginCredentialPayload;
        if (payload.platformUid !== params.expectedPlatformUid) {
            continue;
        }

        if (payload.expiresAt <= Date.now()) {
            continue;
        }

        const activeToken = await redis.get(getActiveCredentialKeyByUser(payload.userId));
        if (activeToken !== token) {
            continue;
        }

        return payload;
    }

    return null;
}
