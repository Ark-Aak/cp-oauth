import { defineEventHandler, getRouterParam, createError, setResponseHeaders } from 'h3';
import { z } from 'zod';
import { parseQuery } from '~/server/utils/validation';
import { getPublicProfile, getPublicProfileStats } from '~/server/utils/public-profile';

const querySchema = z
    .object({
        includeStats: z.enum(['true', 'false']).default('true')
    })
    .strict();

export default defineEventHandler(async event => {
    setResponseHeaders(event, { 'Cache-Control': 'no-store', Pragma: 'no-cache' });
    const username = getRouterParam(event, 'username');
    if (!username) throw createError({ statusCode: 400, message: 'Username required' });
    const query = parseQuery(event, querySchema);
    const data = await getPublicProfile(username);
    return query.includeStats === 'false'
        ? data.profile
        : { ...data.profile, ...(await getPublicProfileStats(data)) };
});
