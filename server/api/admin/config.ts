import { requireAdmin } from '~/server/utils/admin';
import { configPatchSchema, getAdminConfig, updateConfig } from '~/server/utils/config';
import { parseBody } from '~/server/utils/validation';

export default defineEventHandler(async event => {
    setResponseHeader(event, 'Cache-Control', 'no-store');
    const adminId = await requireAdmin(event);

    if (event.method === 'GET') {
        return await getAdminConfig();
    }

    if (event.method === 'PATCH') {
        return await updateConfig(adminId, await parseBody(event, configPatchSchema));
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
