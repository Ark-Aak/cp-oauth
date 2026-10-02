import { completeThirdpartyAuthentication } from '~/server/utils/thirdparty-auth';

export default defineEventHandler(event => completeThirdpartyAuthentication(event, 'clist'));
