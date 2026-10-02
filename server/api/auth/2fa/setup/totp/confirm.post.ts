import { z } from 'zod';
import { parseBody } from '~/server/utils/validation';
import { confirmTwoFactorSetup } from '~/server/utils/two-factor';

export default defineEventHandler(async event => {
    const body = await parseBody(
        event,
        z
            .object({
                code: z
                    .string()
                    .trim()
                    .regex(/^\d{6}$/)
            })
            .strict()
    );
    return confirmTwoFactorSetup(event, 'totp', body.code);
});
