import { getPublicSiteStats } from '~/server/utils/stats';

export default defineEventHandler(async event => {
    setHeader(event, 'cache-control', 'public, max-age=60');

    return getPublicSiteStats();
});
