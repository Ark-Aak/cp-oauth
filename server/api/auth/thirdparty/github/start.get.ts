import { startThirdpartyAuthentication } from '~/server/utils/thirdparty-auth';

export default defineEventHandler(event => startThirdpartyAuthentication(event, 'github'));
