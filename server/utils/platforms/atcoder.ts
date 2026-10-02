import { createError } from 'h3';
import type { PlatformVerifier, VerifyResult } from './types';

function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function extractAffiliation(html: string): string | null {
    const match = html.match(
        /<tr>\s*<th[^>]*>\s*Affiliation\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/i
    );
    if (!match) {
        return null;
    }

    const affiliationCell = match[1];
    if (!affiliationCell) {
        return null;
    }

    const raw = affiliationCell
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();

    return decodeHtmlEntities(raw).trim();
}

export const atcoderVerifier: PlatformVerifier = {
    platform: 'atcoder',
    displayName: 'AtCoder',

    async verify({ platformUid, code, credential }): Promise<VerifyResult> {
        const username = platformUid.trim();

        if (!username) {
            return {
                success: false,
                platformUid,
                error: 'AtCoder username is required'
            };
        }

        void credential;

        try {
            const html = await $fetch<string>(
                `https://atcoder.jp/users/${encodeURIComponent(username)}`,
                {
                    responseType: 'text',
                    timeout: 10_000,
                    retry: 0,
                    headers: {
                        'user-agent': 'CP-OAuth/1.0 (+https://atcoder.jp)'
                    }
                }
            );

            const affiliation = extractAffiliation(html);
            if (!affiliation) {
                return {
                    success: false,
                    platformUid: username,
                    error: 'Affiliation not found on AtCoder profile'
                };
            }

            if (!affiliation.includes(code)) {
                return {
                    success: false,
                    platformUid: username,
                    error: 'Verification code not found in Affiliation'
                };
            }

            return {
                success: true,
                platformUid: username,
                platformUsername: username
            };
        } catch (e: unknown) {
            if (e && typeof e === 'object' && 'statusCode' in e && e.statusCode === 404) {
                return {
                    success: false,
                    platformUid: username,
                    error: 'AtCoder user not found'
                };
            }
            throw createError({ statusCode: 502, message: 'Failed to fetch AtCoder profile' });
        }
    }
};
