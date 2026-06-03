import { consola } from 'consola';
import type { PlatformVerifier, VerifyResult } from './types';
import { fetchLuoguPaste } from '~/server/utils/fetch-luogu';

const logger = consola.withTag('platform:luogu');

export const luoguVerifier: PlatformVerifier = {
    platform: 'luogu',
    displayName: '洛谷',

    async verify({ platformUid, code, credential }): Promise<VerifyResult> {
        const pasteId = credential.trim();
        if (!pasteId) {
            return { success: false, platformUid, error: 'Clipboard ID is required' };
        }

        logger.info(`Verifying clipboard ${pasteId} for uid=${platformUid}`);

        try {
            const paste = await fetchLuoguPaste(pasteId);
            if (!paste) {
                logger.warn(`Clipboard ${pasteId} not found`);
                return { success: false, platformUid, error: 'Clipboard not found' };
            }

            if (!paste.isPublic) {
                logger.warn(`Clipboard ${pasteId} is not public`);
                return { success: false, platformUid, error: 'Clipboard is not public' };
            }

            const pasteOwnerUid = paste.ownerUid;
            if (pasteOwnerUid !== String(platformUid)) {
                logger.warn(
                    `Clipboard owner mismatch: expected uid=${platformUid}, got uid=${pasteOwnerUid}`
                );
                return {
                    success: false,
                    platformUid,
                    error: 'Clipboard owner does not match the claimed UID'
                };
            }

            if (!paste.data.includes(code)) {
                logger.warn(`Verification code not found in clipboard ${pasteId}`);
                return {
                    success: false,
                    platformUid,
                    error: 'Verification code not found in clipboard'
                };
            }

            logger.success(`Verified: uid=${pasteOwnerUid}, username=${paste.ownerUsername}`);
            return {
                success: true,
                platformUid: pasteOwnerUid,
                platformUsername: paste.ownerUsername
            };
        } catch (e: unknown) {
            const err = e as { statusCode?: number; message?: string };
            return { success: false, platformUid, error: err.message || 'Verification failed' };
        }
    }
};
