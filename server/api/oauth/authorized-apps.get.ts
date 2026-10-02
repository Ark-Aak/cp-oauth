import { getUserIdFromEvent } from '~/server/utils/auth';
import prisma from '~/server/utils/prisma';
import { handleOAuthRequest } from '~/server/utils/oauth';

interface ActiveAuthorizedApp {
    clientId: string;
    name: string;
    scopes: string[];
    latestAuthorizedAt: Date;
    accessTokenCount: number;
    refreshTokenCount: number;
    pendingAuthorizationCodeCount: number;
}

export default defineEventHandler(event =>
    handleOAuthRequest(
        event,
        async () => {
            const userId = getUserIdFromEvent(event);
            const now = new Date();
            const apps = await prisma.$queryRaw<ActiveAuthorizedApp[]>`
        WITH active_grants AS (
            SELECT client_id, scopes, created_at, 'access' AS kind
            FROM oauth_access_tokens
            WHERE user_id = ${userId} AND expires_at > ${now}
            UNION ALL
            SELECT client_id, scopes, created_at, 'refresh' AS kind
            FROM oauth_refresh_tokens
            WHERE user_id = ${userId} AND NOT revoked AND expires_at > ${now}
            UNION ALL
            SELECT client_id, scopes, created_at, 'code' AS kind
            FROM oauth_authorization_codes
            WHERE user_id = ${userId} AND NOT used AND expires_at > ${now}
        ), grouped AS (
            SELECT client_id, MAX(created_at) AS latest_authorized_at,
                (COUNT(*) FILTER (WHERE kind = 'access'))::int AS access_count,
                (COUNT(*) FILTER (WHERE kind = 'refresh'))::int AS refresh_count,
                (COUNT(*) FILTER (WHERE kind = 'code'))::int AS code_count
            FROM active_grants
            GROUP BY client_id
        ), granted_scopes AS (
            SELECT client_id, array_agg(DISTINCT scope ORDER BY scope) AS scopes
            FROM active_grants CROSS JOIN LATERAL unnest(active_grants.scopes) AS granted(scope)
            GROUP BY client_id
        )
        SELECT c.client_id AS "clientId", c.name,
            COALESCE(s.scopes, ARRAY[]::text[]) AS scopes,
            g.latest_authorized_at AS "latestAuthorizedAt",
            g.access_count AS "accessTokenCount",
            g.refresh_count AS "refreshTokenCount",
            g.code_count AS "pendingAuthorizationCodeCount"
        FROM grouped g
        JOIN oauth_clients c ON c.client_id = g.client_id
        LEFT JOIN granted_scopes s ON s.client_id = g.client_id
        ORDER BY g.latest_authorized_at DESC, c.client_id ASC
    `;
            return apps.map(app => ({
                ...app,
                latestAuthorizedAt: app.latestAuthorizedAt.toISOString()
            }));
        },
        'invalid_request'
    )
);
