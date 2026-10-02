import { createError } from 'h3';
import { z } from 'zod';

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

const responseSchema = z.object({
    data: z
        .object({
            userProfilePublicProfile: z
                .object({
                    profile: z.object({
                        userSlug: z.string().min(1),
                        realName: z.string().nullable(),
                        aboutMe: z.string().nullable(),
                        userAvatar: z.string().nullable()
                    }),
                    siteRanking: z.number().nullable()
                })
                .nullable(),
            userProfileUserQuestionProgress: z
                .object({
                    numAcceptedQuestions: z.array(
                        z.object({
                            difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
                            count: z.number().int().nonnegative()
                        })
                    )
                })
                .nullable()
        })
        .optional(),
    errors: z.array(z.object({ message: z.string() })).optional()
});

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
 * Uses the leetcode.cn GraphQL endpoint. Null means a real missing profile;
 * network, GraphQL and malformed responses are upstream errors, not "not found".
 *
 * Note: LeetCode does not expose a stable numeric user ID in its public
 * GraphQL schema, so userSlug is used as the platformUid throughout cp-oauth.
 * Users who change their userSlug will need to re-link their account.
 */
export async function fetchLeetcodeProfile(userSlug: string): Promise<LeetcodeProfile | null> {
    const trimmed = userSlug.trim();
    if (!trimmed) throw createError({ statusCode: 400, message: 'LeetCode username is required' });

    let response: unknown;
    try {
        response = await $fetch(LEETCODE_GRAPHQL_URL, {
            method: 'POST',
            timeout: 10_000,
            retry: 0,
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
    } catch {
        throw createError({ statusCode: 502, message: 'Failed to fetch LeetCode profile' });
    }
    const parsed = responseSchema.safeParse(response);
    if (!parsed.success || parsed.data.errors?.length || !parsed.data.data) {
        throw createError({ statusCode: 502, message: 'Invalid LeetCode profile response' });
    }
    const data = parsed.data.data;
    const publicProfile = data.userProfilePublicProfile;
    if (publicProfile === null) return null;
    const counts = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const entry of data.userProfileUserQuestionProgress?.numAcceptedQuestions || []) {
        counts[entry.difficulty] = entry.count;
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
}
