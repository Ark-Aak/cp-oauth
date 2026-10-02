import { z } from 'zod';
import { parseBody } from '~/server/utils/validation';
import {
    authenticationResponseSchema,
    completePasskeyAuthentication
} from '~/server/utils/passkey';

export default defineEventHandler(async event => {
    const body = await parseBody(
        event,
        z
            .object({
                challengeId: z.string().min(1).max(128),
                response: authenticationResponseSchema
            })
            .strict()
    );
    return completePasskeyAuthentication(event, body.challengeId, body.response, 'login');
});
