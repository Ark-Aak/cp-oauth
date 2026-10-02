import type { Platform } from '../utils/platforms';
import type { ScopeName } from '../utils/oauth-scopes';
import type { TwoFactorMethod } from './auth';

export interface MeResponse {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    homepage: string | null;
    avatarUrl: string | null;
    role: 'user' | 'admin';
    emailVerified: boolean;
    pendingEmail: string | null;
    pendingEmailExpiresAt: string | null;
    publicLinkedPlatforms: Platform[];
    publicCpStats: boolean;
    publicRatingHistory: boolean;
    theme: 'system' | 'light' | 'dark';
    locale: 'en' | 'zh' | 'ja';
}

export interface PublicConfigResponse {
    siteTitle: string;
    registrationEnabled: boolean;
    recentUsersCount: number;
    turnstileEnabled: boolean;
    turnstileSiteKey: string;
    githubLoginEnabled: boolean;
    googleLoginEnabled: boolean;
    codeforcesLoginEnabled: boolean;
    clistLoginEnabled: boolean;
}

export interface LinkedAccount {
    id: string;
    platform: Platform;
    platformUid: string;
    platformUsername: string | null;
    verifiedAt: string;
}

export interface AuthorizedApp {
    clientId: string;
    name: string;
    scopes: ScopeName[];
    latestAuthorizedAt: string;
    accessTokenCount: number;
    refreshTokenCount: number;
    pendingAuthorizationCodeCount: number;
}

export interface OAuthClientDraft {
    name: string;
    redirectUris: string[];
    requireEmailVerified: boolean;
}
export interface OAuthClient extends OAuthClientDraft {
    id: string;
    clientId: string;
    createdAt: string;
}

export type PublicLinkedAccount = Pick<
    LinkedAccount,
    'platform' | 'platformUid' | 'platformUsername'
>;
export interface RatingHistoryItem {
    resource: string;
    resource_name: string;
    contest_id: number;
    event: string;
    date: string;
    handle: string;
    place: number | null;
    old_rating: number | null;
    new_rating: number | null;
    rating_change: number | null;
}

export interface UserSummary {
    id: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    createdAt: string;
}
export interface QuoteSummary {
    text: string;
    source: string;
    fromWho: string | null;
}
export interface NoticeSummary {
    id: string;
    title: string;
    content: string;
    pinned: boolean;
    publishedAt: string;
}
export interface SiteStatsResponse {
    users: number;
    linkedAccounts: number;
    oauthClients: number;
    oauthLoginRequestsToday: number;
}
export type AdminUser = Pick<
    MeResponse,
    'id' | 'email' | 'username' | 'displayName' | 'role' | 'emailVerified'
> & { createdAt: string };
export interface ShowcaseItem {
    id: string;
    category: 'site' | 'project';
    name: string;
    description: string;
    url: string | null;
    iconUrl: string | null;
    sortOrder: number;
    invalidUrls?: Array<'url' | 'iconUrl'>;
}
export interface OAuthAuthorizationResponse {
    client: Pick<OAuthClient, 'name' | 'clientId' | 'requireEmailVerified'>;
    scopes: ScopeName[];
    redirectUri: string;
    state: string | null;
    codeChallenge: string | null;
    codeChallengeMethod: string | null;
}

export interface PasskeySummary {
    id: string;
    name: string;
    createdAt: string;
}
export interface TwoFactorStatus {
    twoFactorEnabled: boolean;
    twoFactorMethod: TwoFactorMethod | null;
}
