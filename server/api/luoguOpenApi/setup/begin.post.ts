import { createLuoguLoginToken } from '~/server/utils/luogu-openapi-credentials';
import { getUserIdFromEvent } from '~/server/utils/auth';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    await createLuoguLoginToken(userId);
    return;
});
