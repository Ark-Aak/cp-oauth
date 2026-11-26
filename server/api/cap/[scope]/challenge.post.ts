import { getQuery, getRouterParam, setResponseHeader, setResponseStatus } from 'h3';
import { createCapChallenge, isCapEnabled, parseCapScope } from '~/server/utils/cap';

export default defineEventHandler(async event => {
    setResponseHeader(event, 'Cache-Control', 'no-store');
    const scope = parseCapScope(getRouterParam(event, 'scope'));
    if (!(await isCapEnabled())) {
        setResponseStatus(event, 400);
        return { error: 'Captcha is disabled' };
    }
    const query = getQuery(event);
    const noWasm = query.wasm === '0';
    return createCapChallenge(scope, { noWasm });
});
