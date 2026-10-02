export const PLATFORMS = {
    luogu: {
        name: 'Luogu',
        translationKey: 'binding.platforms.luogu',
        method: 'proof',
        refreshable: true
    },
    atcoder: {
        name: 'AtCoder',
        translationKey: 'binding.platforms.atcoder',
        method: 'proof',
        refreshable: false
    },
    leetcode: {
        name: 'LeetCode',
        translationKey: 'binding.platforms.leetcode',
        method: 'proof',
        refreshable: false
    },
    codeforces: {
        name: 'Codeforces',
        translationKey: 'binding.platforms.codeforces',
        method: 'oauth',
        refreshable: true
    },
    github: {
        name: 'GitHub',
        translationKey: 'binding.platforms.github',
        method: 'oauth',
        refreshable: true
    },
    google: {
        name: 'Google',
        translationKey: 'binding.platforms.google',
        method: 'oauth',
        refreshable: false
    },
    clist: {
        name: 'Clist.by',
        translationKey: 'binding.platforms.clist',
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
