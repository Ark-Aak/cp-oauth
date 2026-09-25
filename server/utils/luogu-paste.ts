import { consola } from 'consola';

const logger = consola.withTag('platform:luogu');
const LUOGU_USER_AGENT = 'Mozilla/5.0 (compatible; CPOAuth/1.0)';
const LUOGU_PASTE_HOSTS = new Set([
    'luogu.com',
    'www.luogu.com',
    'luogu.com.cn',
    'www.luogu.com.cn'
]);

interface LuoguPasteResponse {
    status: number;
    data: {
        paste: {
            data: string;
            id: string;
            public: boolean;
            user: {
                uid: number;
                name: string;
            };
        };
    };
}

export interface LuoguPasteData {
    id: string;
    data: string;
    isPublic: boolean;
    ownerUid: string;
    ownerUsername: string;
}

function parseLuoguPasteId(input: string): string | null {
    if (/^[A-Za-z0-9]+$/.test(input)) {
        return input;
    }

    try {
        const url = new URL(input);
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            !LUOGU_PASTE_HOSTS.has(url.hostname) ||
            url.username ||
            url.password ||
            url.port
        ) {
            return null;
        }

        return url.pathname.match(/^\/paste\/([A-Za-z0-9]+)\/?$/)?.[1] || null;
    } catch {
        return null;
    }
}

export async function fetchLuoguPaste(pasteIdOrUrl: string): Promise<LuoguPasteData | null> {
    const input = pasteIdOrUrl.trim();
    if (!input) {
        return null;
    }

    const normalizedPasteId = parseLuoguPasteId(input);
    if (!normalizedPasteId) {
        throw createError({ statusCode: 400, message: 'Invalid Luogu clipboard ID or URL' });
    }

    try {
        const res = await $fetch<LuoguPasteResponse>(
            `https://www.luogu.com/paste/${normalizedPasteId}`,
            {
                method: 'GET',
                headers: {
                    'user-agent': LUOGU_USER_AGENT,
                    accept: 'application/json',
                    'x-lentille-request': 'content-only'
                }
            }
        );

        const paste = res.data?.paste;
        if (!paste) {
            return null;
        }

        return {
            id: paste.id,
            data: paste.data,
            isPublic: paste.public,
            ownerUid: String(paste.user.uid),
            ownerUsername: paste.user.name
        };
    } catch (e: unknown) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 404) {
            return null;
        }
        logger.error(`Failed to fetch clipboard ${normalizedPasteId}:`, e);
        throw createError({ statusCode: 502, message: 'Failed to fetch clipboard from Luogu' });
    }
}
