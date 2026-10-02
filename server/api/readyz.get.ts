import { defineEventHandler, setHeader, setResponseStatus } from 'h3';
import prisma from '~/server/utils/prisma';
import { getRedis } from '~/server/utils/redis';

export default defineEventHandler(async event => {
    setHeader(event, 'cache-control', 'no-store');
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness deadline exceeded')), 2000);
    });

    try {
        await Promise.race([
            Promise.all([
                prisma.$queryRaw`SELECT 1`,
                getRedis()
                    .ping()
                    .then(reply => {
                        if (reply !== 'PONG') {
                            throw new Error('Redis probe failed');
                        }
                    })
            ]),
            deadline
        ]);
        return { status: 'ready' };
    } catch {
        setResponseStatus(event, 503);
        return { status: 'unavailable' };
    } finally {
        clearTimeout(timer);
    }
});
