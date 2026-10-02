import { z } from 'zod';
import { defineEventHandler } from 'h3';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { reauthPurposeSchema } from '~/server/utils/auth-completion';
import { parseBody } from '~/server/utils/validation';
import { beginPasskeyAuthentication } from '~/server/utils/passkey';

export default defineEventHandler(async event => {
    const body = await parseBody(
        event,
        z
            .object({
                purpose: reauthPurposeSchema,
                redirect: z.string().max(4096).optional()
            })
            .strict()
    );
    return beginPasskeyAuthentication(event, {
        mode: 'reauth',
        purpose: body.purpose,
        redirect: getSafeRedirectTarget(body.redirect)
    });
});
