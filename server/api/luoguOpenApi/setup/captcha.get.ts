import { getLuoguCaptcha } from '~/server/utils/fetch-luogu';
import { getLuoguLoginToken } from '~/server/utils/luogu-openapi-credentials';
import { getUserIdFromEvent } from '~/server/utils/auth';

export default defineEventHandler(async event => {
    const userId = getUserIdFromEvent(event);
    return new Response(await getLuoguCaptcha(getLuoguLoginToken(userId)), {
        headers: {
            'Content-Type': 'image/jpeg'
        }
    });
});
