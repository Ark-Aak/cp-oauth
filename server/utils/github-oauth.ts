interface GitHubTokenResponse {
    access_token: string;
    token_type?: string;
    scope?: string;
}

interface GitHubEmail {
    email: string;
    verified: boolean;
    primary: boolean;
    visibility: string | null;
}

interface GitHubUser {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
    email: string | null;
}

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
    const token = await $fetch<GitHubTokenResponse>(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json'
        },
        body: {
            client_id: params.clientId,
            client_secret: params.clientSecret,
            code: params.code,
            redirect_uri: params.redirectUri
        }
    });

    if (!token.access_token) {
        throw createError({
            statusCode: 502,
            message: 'GitHub token response missing access_token'
        });
    }

    return token;
}

export async function resolveGitHubIdentity(accessToken: string): Promise<GitHubIdentity> {
    const user = await $fetch<GitHubUser>(GITHUB_USER_URL, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });

    if (!user?.id || !user.login) {
        throw createError({ statusCode: 502, message: 'Unable to resolve GitHub user identity' });
    }

    let email = user.email?.trim().toLowerCase() || null;
    let emailVerified = false;

    try {
        const emails = await $fetch<GitHubEmail[]>(GITHUB_EMAILS_URL, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        const primary = emails.find(item => item.primary) || emails.find(item => item.verified);
        if (primary) {
            email = primary.email.trim().toLowerCase();
            emailVerified = Boolean(primary.verified);
        }
    } catch {
        // ignore secondary email fetch failure
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
