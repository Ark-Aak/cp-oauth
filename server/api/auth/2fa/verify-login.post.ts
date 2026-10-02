import { z } from 'zod';
import { parseBody } from '~/server/utils/validation';
import { completeTwoFactorAuthentication } from '~/server/utils/auth-completion';

const verifySchema = z
    .object({
        challengeId: z.string().min(1).max(128),
        code: z
            .string()
            .trim()
            .regex(/^\d{6}$/)
    })
    .strict();

export default defineEventHandler(async event => {
    const { challengeId, code } = await parseBody(event, verifySchema);
    return completeTwoFactorAuthentication(event, challengeId, code);
});
