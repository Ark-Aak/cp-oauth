import { verifyPlatformRegistration } from '~/server/utils/platform-registration';

export default defineEventHandler(event => verifyPlatformRegistration(event, 'leetcode'));
