import { requestPlatformRegistration } from '~/server/utils/platform-registration';

export default defineEventHandler(event => requestPlatformRegistration(event, 'leetcode'));
