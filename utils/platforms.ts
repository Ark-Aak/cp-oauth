export const PLATFORMS = {
    luogu: {
        name: 'Luogu',
        method: 'proof',
        refreshable: true
    },
    atcoder: {
        name: 'AtCoder',
        method: 'proof',
        refreshable: false
    },
    leetcode: {
        name: 'LeetCode',
        method: 'proof',
        refreshable: false
    },
    codeforces: {
        name: 'Codeforces',
        method: 'oauth',
        refreshable: true
    },
    github: {
        name: 'GitHub',
        method: 'oauth',
        refreshable: true
    },
    google: {
        name: 'Google',
        method: 'oauth',
        refreshable: false
    },
    clist: {
        name: 'Clist.by',
        method: 'oauth',
        refreshable: true
    }
} as const;

export type Platform = keyof typeof PLATFORMS;
export type VerifiablePlatform = 'luogu' | 'atcoder' | 'leetcode';
export type OAuthProvider = 'github' | 'google' | 'codeforces' | 'clist';
export const PLATFORM_NAMES = Object.keys(PLATFORMS) as Platform[];
export const VERIFIABLE_PLATFORMS: VerifiablePlatform[] = ['luogu', 'atcoder', 'leetcode'];
export const OAUTH_PROVIDERS: OAuthProvider[] = ['github', 'google', 'codeforces', 'clist'];

export function isPlatform(value: string): value is Platform {
    return Object.hasOwn(PLATFORMS, value);
}
