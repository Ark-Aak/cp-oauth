import crypto from 'crypto';
import { getUserIdFromEvent } from '~/server/utils/auth';
import { getConfig } from '~/server/utils/config';
import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';
import { buildGitHubAuthorizationUrl } from '~/server/utils/github-oauth';
import { verifyTurnstileToken } from '~/server/utils/turnstile';

type GitHubOAuthMode = 'login' | 'bind' | 'register';
const STATE_TTL_SECONDS = 10 * 60;

function parseMode(value: unknown): GitHubOAuthMode {
    if (value === 'bind') return 'bind';
    if (value === 'register') return 'register';
    return 'login';
}

function getSafeInternalRedirect(value: unknown): string {
    if (typeof value !== 'string') return '/';
    const target = value.trim();
    if (!target.startsWith('/') || target.startsWith('//')) return '/';
    return target;
}

export default defineEventHandler(async event => {
    const query = getQuery(event);
    const mode = parseMode(query.mode);
    const clientId = (await getConfig('github_client_id')).trim();

    if (!clientId) {
        throw createError({ statusCode: 503, message: 'GitHub login is not configured' });
    }

    const state = crypto.randomBytes(24).toString('hex');
    const redirectAfterLogin = getSafeInternalRedirect(query.redirect);
    const redirectUri = `${getRequestURL(event).origin}/oauth/thirdparty/github`;
    const bindUserId = mode === 'bind' ? getUserIdFromEvent(event) : null;

    if (mode === 'register') {
        const turnstileToken = typeof query.turnstileToken === 'string' ? query.turnstileToken : '';
        await verifyTurnstileToken({
            token: turnstileToken,
            action: `github:${mode}:start`
        });
    }

    if (mode === 'bind' && bindUserId) {
        const existing = await prisma.linkedAccount.findUnique({
            where: {
                userId_platform: {
                    userId: bindUserId,
                    platform: 'github'
                }
            },
            select: { id: true }
        });

        if (existing) {
            throw createError({
                statusCode: 409,
                message: 'You have already linked a GitHub account'
            });
        }
    }

    const authUrl = buildGitHubAuthorizationUrl({
        clientId,
        redirectUri,
        state
    });

    await getRedis().set(
        `oauth:github:state:${state}`,
        JSON.stringify({ mode, bindUserId, redirectAfterLogin, createdAt: Date.now() }),
        'EX',
        STATE_TTL_SECONDS
    );

    return { authorizationUrl: authUrl };
});
