import { defineEventHandler, getRouterParam, createError, setResponseHeaders } from 'h3';
import { getPublicProfile, getPublicProfileStats } from '~/server/utils/public-profile';

export default defineEventHandler(async event => {
    setResponseHeaders(event, { 'Cache-Control': 'no-store', Pragma: 'no-cache' });
    const username = getRouterParam(event, 'username');
    if (!username) throw createError({ statusCode: 400, message: 'Username required' });
    return getPublicProfileStats(await getPublicProfile(username));
});
