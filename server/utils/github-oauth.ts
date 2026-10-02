import { createError } from 'h3';
import { z } from 'zod';

const tokenSchema = z.object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    scope: z.string().optional()
});
type GitHubTokenResponse = z.infer<typeof tokenSchema>;
const userSchema = z.object({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    login: z.string().trim().min(1),
    name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    email: z.string().nullable()
});
const emailsSchema = z.array(
    z.object({ email: z.string(), verified: z.boolean(), primary: z.boolean() })
);

export interface GitHubIdentity {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
}

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

export function buildGitHubAuthorizationUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
}): string {
    const url = new URL(GITHUB_AUTH_URL);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', params.state);
    return url.toString();
}

export async function exchangeGitHubAuthorizationCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}): Promise<GitHubTokenResponse> {
    let response: unknown;
    try {
        response = await $fetch(GITHUB_TOKEN_URL, {
            method: 'POST',
            timeout: 10_000,
            retry: 0,
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: {
                client_id: params.clientId,
                client_secret: params.clientSecret,
                code: params.code,
                redirect_uri: params.redirectUri
            }
        });
    } catch {
        throw createError({ statusCode: 502, message: 'GitHub token exchange failed' });
    }

    const parsed = tokenSchema.safeParse(response);
    if (!parsed.success)
        throw createError({ statusCode: 502, message: 'Invalid GitHub token response' });
    return parsed.data;
}

export async function resolveGitHubIdentity(accessToken: string): Promise<GitHubIdentity> {
    let response: unknown;
    try {
        response = await $fetch(GITHUB_USER_URL, {
            timeout: 10_000,
            retry: 0,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
    } catch {
        throw createError({ statusCode: 502, message: 'GitHub identity is unavailable' });
    }

    const parsed = userSchema.safeParse(response);
    if (!parsed.success)
        throw createError({ statusCode: 502, message: 'Unable to resolve GitHub user identity' });
    const user = parsed.data;

    let email = user.email?.trim().toLowerCase() || null;
    let emailVerified = false;

    try {
        const response = await $fetch(GITHUB_EMAILS_URL, {
            timeout: 10_000,
            retry: 0,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        const parsedEmails = emailsSchema.safeParse(response);
        if (!parsedEmails.success)
            throw createError({ statusCode: 502, message: 'Invalid GitHub email response' });
        const emails = parsedEmails.data;

        const primary = emails.find(item => item.primary) || emails.find(item => item.verified);
        if (primary) {
            email = primary.email.trim().toLowerCase();
            emailVerified = primary.verified === true;
        }
    } catch {
        // An unavailable email endpoint cannot establish a verified email identity.
    }

    return {
        platformUid: String(user.id),
        platformUsername: user.login,
        email,
        emailVerified,
        displayName: user.name,
        avatarUrl: user.avatar_url
    };
}
