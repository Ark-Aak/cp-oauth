import { loginLuogu } from '~/server/utils/fetch-luogu';
import { getLuoguLoginToken } from '~/server/utils/luogu-openapi-credentials';
import { getUserIdFromEvent } from '~/server/utils/auth';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    const body: unknown = await readBody(event);
    if (
        typeof body !== 'object' ||
        body === null ||
        !('username' in body) ||
        !('password' in body) ||
        !('captcha' in body) ||
        typeof body.username !== 'string' ||
        typeof body.password !== 'string' ||
        typeof body.captcha !== 'string'
    ) {
        throw createError({ statusCode: 400, message: 'Invalid request body' });
    }
    return await loginLuogu(getLuoguLoginToken(userId), body.username, body.password, body.captcha);
});
