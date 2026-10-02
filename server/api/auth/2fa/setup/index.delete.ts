import { defineEventHandler, setResponseStatus } from 'h3';
import { cancelTwoFactorSetup } from '~/server/utils/two-factor';

export default defineEventHandler(async event => {
    await cancelTwoFactorSetup(event);
    setResponseStatus(event, 204);
    return null;
});
