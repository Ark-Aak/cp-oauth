import { consola } from 'consola';

const logger = consola.withTag('leetcode-fetch');

const LEETCODE_GRAPHQL_URL = 'https://leetcode.cn/graphql';
const LEETCODE_USER_AGENT = 'Mozilla/5.0 (compatible; CPOAuth/1.0)';

export interface LeetcodeProfile {
    userSlug: string;
    realName: string | null;
    aboutMe: string | null;
    userAvatar: string | null;
    siteRanking: number | null;
    acceptedEasy: number;
    acceptedMedium: number;
    acceptedHard: number;
}

interface LeetcodeGraphQLResponse {
    data?: {
        userProfilePublicProfile: {
            profile: {
                userSlug: string;
                realName: string | null;
                aboutMe: string | null;
                userAvatar: string | null;
            };
            siteRanking: number | null;
        } | null;
        userProfileUserQuestionProgress: {
            numAcceptedQuestions: Array<{
                difficulty: 'EASY' | 'MEDIUM' | 'HARD';
                count: number;
            }>;
        } | null;
    };
    errors?: Array<{ message: string }>;
}

const PROFILE_QUERY = `query userProfile($userSlug: String!) {
    userProfilePublicProfile(userSlug: $userSlug) {
        profile {
            userSlug
            realName
            aboutMe
            userAvatar
        }
        siteRanking
    }
    userProfileUserQuestionProgress(userSlug: $userSlug) {
        numAcceptedQuestions {
            difficulty
            count
        }
    }
}`;

/**
 * Fetches a LeetCode user's public profile and accepted-question stats.
 *
 * Uses the leetcode.cn GraphQL endpoint. Returns null if the user does
 * not exist or the request fails — callers must treat null as "user not found".
 *
 * Note: LeetCode does not expose a stable numeric user ID in its public
 * GraphQL schema, so userSlug is used as the platformUid throughout cp-oauth.
 * Users who change their userSlug will need to re-link their account.
 */
export async function fetchLeetcodeProfile(userSlug: string): Promise<LeetcodeProfile | null> {
    const trimmed = userSlug.trim();
    if (!trimmed) return null;

    try {
        const res = await $fetch<LeetcodeGraphQLResponse>(LEETCODE_GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                referer: 'https://leetcode.cn',
                'user-agent': LEETCODE_USER_AGENT
            },
            body: {
                query: PROFILE_QUERY,
                variables: { userSlug: trimmed }
            }
        });

        if (res.errors && res.errors.length > 0) {
            logger.warn(
                `LeetCode GraphQL errors for userSlug=${trimmed}: ${res.errors.map(e => e.message).join('; ')}`
            );
            return null;
        }

        const publicProfile = res.data?.userProfilePublicProfile;
        if (!publicProfile) {
            return null;
        }

        const counts: Record<'EASY' | 'MEDIUM' | 'HARD', number> = {
            EASY: 0,
            MEDIUM: 0,
            HARD: 0
        };
        const accepted = res.data?.userProfileUserQuestionProgress?.numAcceptedQuestions || [];
        for (const entry of accepted) {
            if (entry.difficulty in counts) {
                counts[entry.difficulty] = entry.count;
            }
        }

        return {
            userSlug: publicProfile.profile.userSlug,
            realName: publicProfile.profile.realName,
            aboutMe: publicProfile.profile.aboutMe,
            userAvatar: publicProfile.profile.userAvatar,
            siteRanking: publicProfile.siteRanking,
            acceptedEasy: counts.EASY,
            acceptedMedium: counts.MEDIUM,
            acceptedHard: counts.HARD
        };
    } catch (e: unknown) {
        const err = e as { statusCode?: number; message?: string };
        logger.warn(`Failed to fetch LeetCode profile for userSlug=${trimmed}: ${err.message}`);
        return null;
    }
}
