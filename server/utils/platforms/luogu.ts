import { isError } from 'h3';
import type { PlatformVerifier, VerifyResult } from './types';
import { fetchLuoguPaste } from '~/server/utils/luogu-paste';

export const luoguVerifier: PlatformVerifier = {
    platform: 'luogu',
    displayName: '洛谷',
    async verify({ platformUid, code, credential }): Promise<VerifyResult> {
        const pasteId = credential.trim();
        if (!pasteId) return { success: false, platformUid, error: 'Clipboard ID is required' };
        let paste;
        try {
            paste = await fetchLuoguPaste(pasteId);
        } catch (error) {
            if (isError(error) && error.statusCode === 400)
                return { success: false, platformUid, error: error.message };
            throw error;
        }
        if (!paste) return { success: false, platformUid, error: 'Clipboard not found' };
        if (!paste.isPublic)
            return { success: false, platformUid, error: 'Clipboard is not public' };
        if (paste.ownerUid !== platformUid)
            return {
                success: false,
                platformUid,
                error: 'Clipboard owner does not match the claimed UID'
            };
        if (!paste.data.includes(code))
            return {
                success: false,
                platformUid,
                error: 'Verification code not found in clipboard'
            };
        return {
            success: true,
            platformUid: paste.ownerUid,
            platformUsername: paste.ownerUsername
        };
    }
};
