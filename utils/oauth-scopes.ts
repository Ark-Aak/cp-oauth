export const SCOPES = {
    openid: 'Base identity (user ID)',
    profile: 'Username, avatar, and bio',
    email: 'Email address',
    'cp:linked': 'Linked competitive programming accounts',
    'link:luogu': 'Read linked Luogu account info',
    'link:atcoder': 'Read linked AtCoder account info',
    'link:leetcode': 'Read linked LeetCode account info',
    'link:codeforces': 'Read linked Codeforces account info',
    'link:github': 'Read linked GitHub account info',
    'link:google': 'Read linked Google account info',
    'link:clist': 'Read linked Clist account info',
    'cp:summary': 'Aggregated competitive programming stats',
    'cp:details': 'Up to 200 recent rated contest changes for matching linked accounts'
} as const;
export type ScopeName = keyof typeof SCOPES;
