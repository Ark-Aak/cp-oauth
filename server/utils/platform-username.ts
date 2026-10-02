import { createError } from 'h3';
import { z } from 'zod';
import { resolveGitHubIdentity } from './github-oauth';
import { resolveClistIdentity } from './clist-oauth';

export interface RefreshUsernameContext {
    platformUid: string;
    platformUsername?: string | null;
    oauthAccessToken?: string | null;
}

type UsernameFetcher = (context: RefreshUsernameContext) => Promise<string | null>;

const luoguUserSchema = z.object({
    data: z.object({
        user: z.object({
            uid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            name: z.string().min(1)
        })
    })
});
const codeforcesUserSchema = z.object({
    status: z.literal('OK'),
    result: z.array(z.object({ handle: z.string().min(1) })).length(1)
});

async function fetchLuoguUsername(context: RefreshUsernameContext): Promise<string | null> {
    let response: unknown;
    try {
        response = await $fetch(
            `https://www.luogu.com/user/${encodeURIComponent(context.platformUid)}`,
            {
                timeout: 10_000,
                retry: 0,
                headers: {
                    'user-agent': 'Mozilla/5.0 (compatible; CPOAuth/1.0)',
                    'x-lentille-request': 'content-only'
                }
            }
        );
    } catch (error) {
        if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404)
            return null;
        throw createError({ statusCode: 502, message: 'Failed to fetch Luogu username' });
    }
    const parsed = luoguUserSchema.safeParse(response);
    if (!parsed.success || String(parsed.data.data.user.uid) !== context.platformUid) {
        throw createError({ statusCode: 502, message: 'Invalid Luogu user response' });
    }
    return parsed.data.data.user.name;
}

async function fetchCodeforcesUsername(context: RefreshUsernameContext): Promise<string | null> {
    // Numeric OIDC sub is not a handle, and a stored/expired id_token is never an identity source.
    if (!context.platformUsername) {
        throw createError({
            statusCode: 502,
            message: 'No previously verified Codeforces handle is available'
        });
    }
    let response: unknown;
    try {
        response = await $fetch('https://codeforces.com/api/user.info', {
            query: { handles: context.platformUsername },
            timeout: 10_000,
            retry: 0
        });
    } catch {
        throw createError({ statusCode: 502, message: 'Failed to confirm Codeforces handle' });
    }
    const parsed = codeforcesUserSchema.safeParse(response);
    const handle = parsed.success ? parsed.data.result[0]!.handle : null;
    if (!handle || handle.toLowerCase() !== context.platformUsername.toLowerCase()) {
        throw createError({
            statusCode: 502,
            message: 'Unable to confirm the previously verified Codeforces handle'
        });
    }
    return handle;
}

async function fetchGithubUsername(context: RefreshUsernameContext): Promise<string | null> {
    if (!context.oauthAccessToken)
        throw createError({
            statusCode: 409,
            message: 'Sign in with your linked GitHub account to refresh its credentials'
        });
    const identity = await resolveGitHubIdentity(context.oauthAccessToken);
    if (identity.platformUid !== context.platformUid)
        throw createError({
            statusCode: 502,
            message: 'GitHub credentials do not match the linked account'
        });
    return identity.platformUsername;
}

async function fetchClistUsername(context: RefreshUsernameContext): Promise<string | null> {
    if (!context.oauthAccessToken)
        throw createError({
            statusCode: 502,
            message: 'A valid Clist access token is unavailable'
        });
    const identity = await resolveClistIdentity(context.oauthAccessToken);
    if (identity.platformUid !== context.platformUid)
        throw createError({
            statusCode: 502,
            message: 'Clist credentials do not match the linked account'
        });
    return identity.platformUsername;
}

const fetchers: Record<string, UsernameFetcher> = {
    luogu: fetchLuoguUsername,
    codeforces: fetchCodeforcesUsername,
    github: fetchGithubUsername,
    clist: fetchClistUsername
};

export function canRefreshUsername(platform: string): boolean {
    return Object.hasOwn(fetchers, platform);
}

export async function fetchPlatformUsername(
    platform: string,
    context: RefreshUsernameContext
): Promise<string | null> {
    if (!Object.hasOwn(fetchers, platform))
        throw createError({
            statusCode: 400,
            message: 'Username refresh is not supported for this platform'
        });
    return fetchers[platform]!(context);
}
