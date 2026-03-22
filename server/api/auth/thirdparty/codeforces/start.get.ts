import crypto from 'crypto';
import { consola } from 'consola';
import { getConfig } from '~/server/utils/config';
import { getRedis } from '~/server/utils/redis';
import { buildCodeforcesAuthorizationUrl } from '~/server/utils/codeforces-oauth';

const logger = consola.withTag('auth:codeforces:start');
const STATE_TTL_SECONDS = 10 * 60;

function getSafeInternalRedirect(value: unknown): string {
    if (typeof value !== 'string') {
        return '/';
    }
    const target = value.trim();
    if (!target.startsWith('/') || target.startsWith('//')) {
        return '/';
    }
    return target;
}

export default defineEventHandler(async event => {
    const clientId = (await getConfig('codeforces_client_id')).trim();
    if (!clientId) {
        throw createError({
            statusCode: 503,
            message: 'Codeforces login is not configured'
        });
    }

    const state = crypto.randomBytes(24).toString('hex');
    const redirectAfterLogin = getSafeInternalRedirect(getQuery(event).redirect);
    const redirectUri = `${getRequestURL(event).origin}/oauth/thirdparty/codeforces`;

    const authUrl = await buildCodeforcesAuthorizationUrl({
        clientId,
        redirectUri,
        state
    });

    await getRedis().set(
        `oauth:codeforces:state:${state}`,
        JSON.stringify({ redirectAfterLogin, createdAt: Date.now() }),
        'EX',
        STATE_TTL_SECONDS
    );

    logger.info(`Generated Codeforces OAuth state, redirect=${redirectAfterLogin}`);

    return {
        authorizationUrl: authUrl
    };
});
