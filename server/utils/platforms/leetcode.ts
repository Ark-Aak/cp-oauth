import { consola } from 'consola';
import type { PlatformVerifier, VerifyResult } from './types';
import { fetchLeetcodeProfile } from '~/server/utils/leetcode-fetch';

const logger = consola.withTag('platform:leetcode');

export const leetcodeVerifier: PlatformVerifier = {
    platform: 'leetcode',
    displayName: 'LeetCode',

    async verify({ platformUid, code, credential }): Promise<VerifyResult> {
        const userSlug = credential.trim();
        if (!userSlug) {
            return { success: false, platformUid, error: 'LeetCode username is required' };
        }

        logger.info(`Verifying LeetCode userSlug=${userSlug} for uid=${platformUid}`);

        try {
            const profile = await fetchLeetcodeProfile(userSlug);
            if (!profile) {
                logger.warn(`LeetCode user ${userSlug} not found`);
                return { success: false, platformUid, error: 'LeetCode user not found' };
            }

            if (profile.userSlug !== String(platformUid)) {
                logger.warn(
                    `LeetCode userSlug mismatch: expected uid=${platformUid}, got userSlug=${profile.userSlug}`
                );
                return {
                    success: false,
                    platformUid,
                    error: 'LeetCode userSlug does not match the claimed UID'
                };
            }

            if (!profile.aboutMe || !profile.aboutMe.includes(code)) {
                logger.warn(`Verification code not found in LeetCode aboutMe for ${userSlug}`);
                return {
                    success: false,
                    platformUid,
                    error: 'Verification code not found in your LeetCode profile bio'
                };
            }

            logger.success(`Verified LeetCode userSlug=${userSlug}`);
            return {
                success: true,
                platformUid: profile.userSlug,
                platformUsername: profile.realName || profile.userSlug
            };
        } catch (e: unknown) {
            const err = e as { statusCode?: number; message?: string };
            return { success: false, platformUid, error: err.message || 'Verification failed' };
        }
    }
};
