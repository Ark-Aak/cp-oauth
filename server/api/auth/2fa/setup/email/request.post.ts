import { z } from 'zod';
import { parseBody } from '~/server/utils/validation';
import { beginTwoFactorSetup } from '~/server/utils/two-factor';

export default defineEventHandler(async event => {
    const body = await parseBody(
        event,
        z.object({ reauthToken: z.string().min(1).max(256) }).strict()
    );
    return beginTwoFactorSetup(event, 'email_otp', body.reauthToken);
});
