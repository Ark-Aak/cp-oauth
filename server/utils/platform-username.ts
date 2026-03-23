import { consola } from 'consola';
import { getCodeforcesDiscoveryMetadata, resolveCodeforcesIdentity } from './codeforces-oauth';

const logger = consola.withTag('platform-username');
const LUOGU_USER_AGENT = 'Mozilla/5.0 (compatible; CPOAuth/1.0)';

export interface RefreshUsernameContext {
    platformUid: string;
    oauthAccessToken?: string | null;
    oauthIdToken?: string | null;
    oauthTokenType?: string | null;
}

type UsernameFetcher = (context: RefreshUsernameContext) => Promise<string | null>;

interface LuoguLentilleResponse {
    data: {
        user: {
            uid: number;
            name: string;
        };
    };
}

interface CodeforcesUserInfoResponse {
    status: string;
    result: { handle: string }[];
}

async function fetchLuoguUsername(context: RefreshUsernameContext): Promise<string | null> {
    const platformUid = context.platformUid;
    try {
        const res = await $fetch<LuoguLentilleResponse>(
            `https://www.luogu.com/user/${encodeURIComponent(platformUid)}`,
            {
                headers: {
                    'user-agent': LUOGU_USER_AGENT,
                    'x-lentille-request': 'content-only'
                }
            }
        );
        return res.data?.user?.name || null;
    } catch (e: unknown) {
        const err = e as { statusCode?: number; message?: string };
        logger.warn(`Failed to fetch Luogu username for uid=${platformUid}: ${err.message}`);
        return null;
    }
}

async function fetchCodeforcesUsername(context: RefreshUsernameContext): Promise<string | null> {
    const platformUid = context.platformUid;
    if (context.oauthAccessToken) {
        try {
            const discovery = await getCodeforcesDiscoveryMetadata();
            const identity = await resolveCodeforcesIdentity({
                token: {
                    access_token: context.oauthAccessToken,
                    id_token: context.oauthIdToken || undefined,
                    token_type: context.oauthTokenType || undefined
                },
                discovery
            });
            return identity.platformUsername || null;
        } catch (e: unknown) {
            const err = e as { message?: string };
            logger.warn(
                `Failed to fetch Codeforces username via OAuth for uid=${platformUid}: ${err.message}`
            );
        }
    }

    try {
        const res = await $fetch<CodeforcesUserInfoResponse>(
            `https://codeforces.com/api/user.info?handles=${encodeURIComponent(platformUid)}`
        );
        if (res.status === 'OK' && res.result?.length > 0) {
            return res.result[0].handle || null;
        }
        return null;
    } catch (e: unknown) {
        const err = e as { statusCode?: number; message?: string };
        logger.warn(
            `Failed to fetch Codeforces username for handle=${platformUid}: ${err.message}`
        );
        return null;
    }
}

const fetchers: Record<string, UsernameFetcher> = {
    luogu: fetchLuoguUsername,
    codeforces: fetchCodeforcesUsername
};

export function canRefreshUsername(platform: string): boolean {
    return platform in fetchers;
}

export async function fetchPlatformUsername(
    platform: string,
    context: RefreshUsernameContext
): Promise<string | null> {
    const fetcher = fetchers[platform];
    if (!fetcher) {
        return null;
    }
    return fetcher(context);
}
