import type { PublicLinkedAccount, RatingHistoryItem, UserSummary } from './api';

export interface CpStatAccount {
    resource: string;
    resource_name: string;
    handle: string;
    rating: number | null;
    n_contests: number;
    resource_rank: number | null;
    last_activity: string | null;
}

export interface CpStats {
    accounts: CpStatAccount[];
    highest_rating: {
        resource: string;
        resource_name: string;
        handle: string;
        rating: number;
    } | null;
    total_contests: number;
}

export type PublicDataStatus = 'available' | 'unavailable';

export interface PublicProfileStats {
    cpStatsStatus?: PublicDataStatus;
    ratingHistoryStatus?: PublicDataStatus;
    cpStats?: CpStats;
    ratingHistory?: RatingHistoryItem[];
}

export interface PublicProfileResponse extends UserSummary, PublicProfileStats {
    homepage: string | null;
    linkedAccounts: PublicLinkedAccount[];
    publicCpStats: boolean;
    publicRatingHistory: boolean;
}
