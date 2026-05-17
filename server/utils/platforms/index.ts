import type { PlatformVerifier } from './types';

import { atcoderVerifier } from './atcoder';
import { luoguVerifier } from './luogu';
import { leetcodeVerifier } from './leetcode';

const verifiers = new Map<string, PlatformVerifier>([
    ['luogu', luoguVerifier],
    ['atcoder', atcoderVerifier],
    ['leetcode', leetcodeVerifier]
]);

export function getPlatformVerifier(platform: string): PlatformVerifier | undefined {
    return verifiers.get(platform);
}

export function getAllPlatforms(): { platform: string; displayName: string }[] {
    return Array.from(verifiers.values()).map(v => ({
        platform: v.platform,
        displayName: v.displayName
    }));
}
