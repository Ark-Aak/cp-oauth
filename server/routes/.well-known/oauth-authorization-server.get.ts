import { getPublicBaseUrl } from '~/server/utils/base-url';
import { buildOAuthMetadata } from '~/server/utils/oauth-metadata';

export default defineEventHandler(event => {
    setHeader(event, 'Cache-Control', 'public, max-age=3600');
    return buildOAuthMetadata(getPublicBaseUrl());
});
