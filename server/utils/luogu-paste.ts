import { createError } from 'h3';
import { z } from 'zod';

const LUOGU_USER_AGENT = 'Mozilla/5.0 (compatible; CPOAuth/1.0)';
const LUOGU_PASTE_HOSTS: Record<string, true> = {
    'luogu.com': true,
    'www.luogu.com': true,
    'luogu.com.cn': true,
    'www.luogu.com.cn': true
};
const pasteResponseSchema = z.object({
    data: z.object({
        paste: z
            .object({
                id: z.string(),
                data: z.string(),
                public: z.boolean(),
                user: z.object({
                    uid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
                    name: z.string()
                })
            })
            .optional()
    })
});

export interface LuoguPasteData {
    id: string;
    data: string;
    isPublic: boolean;
    ownerUid: string;
    ownerUsername: string;
}

function parseLuoguPasteId(input: string): string | null {
    if (/^[A-Za-z0-9]+$/.test(input)) return input;
    try {
        const url = new URL(input);
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            !Object.hasOwn(LUOGU_PASTE_HOSTS, url.hostname) ||
            url.username ||
            url.password ||
            url.port
        )
            return null;
        return url.pathname.match(/^\/paste\/([A-Za-z0-9]+)\/?$/)?.[1] || null;
    } catch {
        return null;
    }
}

export async function fetchLuoguPaste(pasteIdOrUrl: string): Promise<LuoguPasteData | null> {
    const input = pasteIdOrUrl.trim();
    if (!input) return null;
    const pasteId = parseLuoguPasteId(input);
    if (!pasteId)
        throw createError({ statusCode: 400, message: 'Invalid Luogu clipboard ID or URL' });
    let response: unknown;
    try {
        response = await $fetch(`https://www.luogu.com/paste/${pasteId}`, {
            method: 'GET',
            timeout: 10_000,
            retry: 0,
            headers: {
                'user-agent': LUOGU_USER_AGENT,
                accept: 'application/json',
                'x-lentille-request': 'content-only'
            }
        });
    } catch (error) {
        if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404)
            return null;
        throw createError({ statusCode: 502, message: 'Failed to fetch clipboard from Luogu' });
    }
    const parsed = pasteResponseSchema.safeParse(response);
    if (!parsed.success)
        throw createError({ statusCode: 502, message: 'Invalid Luogu clipboard response' });
    const paste = parsed.data.data.paste;
    if (!paste) return null;
    return {
        id: paste.id,
        data: paste.data,
        isPublic: paste.public,
        ownerUid: String(paste.user.uid),
        ownerUsername: paste.user.name
    };
}
