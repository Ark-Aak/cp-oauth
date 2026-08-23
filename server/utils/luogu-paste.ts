import { consola } from 'consola';

const logger = consola.withTag('platform:luogu');
const LUOGU_USER_AGENT = 'Mozilla/5.0 (compatible; CPOAuth/1.0)';

interface LuoguPasteResponse {
    code: number;
    currentData: {
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

export async function fetchLuoguPaste(pasteId: string): Promise<LuoguPasteData | null> {
    const normalizedPasteId = pasteId.trim();
    if (!normalizedPasteId) {
        return null;
    }

    try {
        const res = await $fetch<LuoguPasteResponse>(
            `https://www.luogu.com/paste/${normalizedPasteId}`,
            {
                headers: {
                    'user-agent': LUOGU_USER_AGENT,
                    'x-luogu-type': 'content-only'
                }
            }
        );

        const paste = res.currentData?.paste;
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
