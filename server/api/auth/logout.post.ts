import { defineEventHandler, setResponseStatus } from 'h3';
import { logoutAuthSession } from '~/server/utils/auth';

export default defineEventHandler(async event => {
    await logoutAuthSession(event);
    setResponseStatus(event, 204);
    return null;
});
