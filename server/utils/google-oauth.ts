import { createError } from 'h3';
import { z } from 'zod';

const tokenSchema = z.object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().finite().positive().optional(),
    id_token: z.string().optional(),
    scope: z.string().optional()
});
type GoogleTokenResponse = z.infer<typeof tokenSchema>;
const userSchema = z.object({
    sub: z.string().trim().min(1),
    email: z.string().optional(),
    email_verified: z.boolean().optional(),
    name: z.string().optional(),
    picture: z.string().optional()
});

export interface GoogleIdentity {
    platformUid: string;
    platformUsername: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function buildGoogleAuthorizationUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
}): string {
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', params.state);
    return url.toString();
}

export async function exchangeGoogleAuthorizationCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}): Promise<GoogleTokenResponse> {
    const form = new URLSearchParams({
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
        grant_type: 'authorization_code'
    });

    let response: unknown;
    try {
        response = await $fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            timeout: 10_000,
            retry: 0,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: form.toString()
        });
    } catch {
        throw createError({ statusCode: 502, message: 'Google token exchange failed' });
    }

    const parsed = tokenSchema.safeParse(response);
    if (!parsed.success)
        throw createError({ statusCode: 502, message: 'Invalid Google token response' });
    return parsed.data;
}

export async function resolveGoogleIdentity(accessToken: string): Promise<GoogleIdentity> {
    let response: unknown;
    try {
        response = await $fetch(GOOGLE_USERINFO_URL, {
            timeout: 10_000,
            retry: 0,
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    } catch {
        throw createError({ statusCode: 502, message: 'Google identity is unavailable' });
    }

    const parsed = userSchema.safeParse(response);
    if (!parsed.success)
        throw createError({ statusCode: 502, message: 'Unable to resolve Google user identity' });
    const user = parsed.data;

    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : null;

    return {
        platformUid: user.sub,
        platformUsername: email || `google_${user.sub}`,
        email,
        emailVerified: user.email_verified === true,
        displayName: user.name || null,
        avatarUrl: user.picture || null
    };
}
