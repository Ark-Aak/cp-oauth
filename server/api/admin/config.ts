import { requireAdmin } from '~/server/utils/admin';
import { getAllConfig, setConfig, clearConfigCache } from '~/server/utils/config';

export default defineEventHandler(async event => {
    await requireAdmin(event);

    if (event.method === 'GET') {
        return await getAllConfig();
    }

    if (event.method === 'PATCH') {
        const body = await readBody(event);
        const allowedKeys = [
            'site_title',
            'registration_enabled',
            'smtp_host',
            'smtp_port',
            'smtp_user',
            'smtp_pass',
            'smtp_from',
            'turnstile_enabled',
            'turnstile_site_key',
            'turnstile_secret_key'
        ];

        for (const [key, value] of Object.entries(body)) {
            if (allowedKeys.includes(key) && typeof value === 'string') {
                await setConfig(key, value);
            }
        }

        await clearConfigCache();
        return await getAllConfig();
    }

    throw createError({ statusCode: 405, message: 'Method not allowed' });
});
