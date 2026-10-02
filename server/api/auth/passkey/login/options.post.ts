import { z } from 'zod';
import { emailSchema } from '~/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { parseBody } from '~/server/utils/validation';
import { beginPasskeyAuthentication } from '~/server/utils/passkey';

export default defineEventHandler(async event => {
    const body = await parseBody(
        event,
        z
            .object({
                email: emailSchema.optional(),
                redirect: z.string().max(4096).optional()
            })
            .strict()
    );
    return beginPasskeyAuthentication(event, {
        mode: 'login',
        email: body.email,
        redirect: getSafeRedirectTarget(body.redirect)
    });
});
