import type { PlatformVerifier, VerifyResult } from './types';
import { fetchLeetcodeProfile } from '~/server/utils/leetcode-fetch';

export const leetcodeVerifier: PlatformVerifier = {
    platform: 'leetcode',
    displayName: 'LeetCode',
    async verify({ platformUid, code, credential }): Promise<VerifyResult> {
        const userSlug = credential.trim();
        if (!userSlug)
            return { success: false, platformUid, error: 'LeetCode username is required' };
        const profile = await fetchLeetcodeProfile(userSlug);
        if (!profile) return { success: false, platformUid, error: 'LeetCode user not found' };
        if (profile.userSlug !== platformUid)
            return {
                success: false,
                platformUid,
                error: 'LeetCode userSlug does not match the claimed UID'
            };
        if (!profile.aboutMe?.includes(code))
            return {
                success: false,
                platformUid,
                error: 'Verification code not found in your LeetCode profile bio'
            };
        return {
            success: true,
            platformUid: profile.userSlug,
            platformUsername: profile.realName || profile.userSlug,
            avatarUrl: profile.userAvatar
        };
    }
};
