import { generateLuoguCSRF, verifyLuogu2FA } from '~/server/utils/fetch-luogu';
import { getLuoguLoginToken } from '~/server/utils/luogu-openapi-credentials';
import { getUserIdFromEvent } from '~/server/utils/auth';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const body = await readBody(event);
    if (
        typeof body !== 'object' ||
        body === null ||
        !('code' in body) ||
        typeof body.code !== 'string'
    ) {
        throw createError({ statusCode: 400, message: 'Invalid request body' });
    }
    await verifyLuogu2FA(getLuoguLoginToken(userId), body.code);
    await generateLuoguCSRF(getLuoguLoginToken(userId));
    return;
});
