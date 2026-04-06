import crypto from 'crypto';

export const SCOPES = {
    openid: 'Base identity (user ID)',
    profile: 'Username, avatar, and bio',
    email: 'Email address',
    'cp:linked': 'Linked competitive programming accounts',
    'link:luogu': 'Read linked Luogu account info',
    'link:atcoder': 'Read linked AtCoder account info',
    'link:codeforces': 'Read linked Codeforces account info',
    'link:github': 'Read linked GitHub account info',
    'link:google': 'Read linked Google account info',
    'link:clist': 'Read linked Clist account info',
    'cp:summary': 'Aggregated competitive programming stats',
    'cp:details': 'Full submission history and rating trends'
} as const;

export type ScopeName = keyof typeof SCOPES;

export function validateScopes(scopes: string[]): scopes is ScopeName[] {
    return scopes.every(s => s in SCOPES);
}

export function generateCode(): string {
    return crypto.randomBytes(32).toString('hex');
}

export function generateToken(): string {
    return crypto.randomBytes(48).toString('hex');
}

export function generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
}

export function generateClientSecret(): string {
    return crypto.randomBytes(32).toString('base64url');
}

export function verifyPKCE(
    codeVerifier: string,
    codeChallenge: string,
    method: string | null
): boolean {
    if (!method || method === 'plain') {
        return codeVerifier === codeChallenge;
    }
    if (method === 'S256') {
        const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
        return hash === codeChallenge;
    }
    return false;
}
