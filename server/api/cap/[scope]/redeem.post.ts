import { getRouterParam, readBody, setResponseHeader, setResponseStatus } from 'h3';
import type { ValidateChallengeBody } from 'capjs-core';
import { isCapEnabled, parseCapScope, redeemCapChallenge } from '~/server/utils/cap';

export default defineEventHandler(async event => {
    setResponseHeader(event, 'Cache-Control', 'no-store');
    const scope = parseCapScope(getRouterParam(event, 'scope'));
    if (!(await isCapEnabled())) {
        setResponseStatus(event, 400);
        return { success: false, error: 'Captcha is disabled' };
    }

    const raw = await readBody<unknown>(event);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        setResponseStatus(event, 400);
        return { success: false, reason: 'invalid_body', error: 'Invalid request body' };
    }

    const result = await redeemCapChallenge(scope, raw as ValidateChallengeBody);
    if (!result.success) {
        setResponseStatus(event, 400);
    }
    return result;
});
