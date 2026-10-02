import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

const LOCK_NAMESPACE = 20261001;
const LOCK_KEY = 5;
const BATCH_SIZE = 1000;

async function deleteExpiredRows(model, now) {
    let cursor;
    let deleted = 0;
    while (true) {
        const rows = await model.findMany({
            where: {
                expiresAt: { lte: now },
                ...(cursor === undefined ? {} : { id: { gt: cursor } })
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: { id: true }
        });
        if (rows.length === 0) return deleted;
        const result = await model.deleteMany({
            where: {
                id: { in: rows.map(row => row.id) },
                expiresAt: { lte: now }
            }
        });
        deleted += result.count;
        // The selected row may have been deleted or extended concurrently. Advance by value,
        // not a Prisma cursor that depends on the last row still existing.
        cursor = rows[rows.length - 1].id;
    }
}

export async function pruneExpiredOAuth({
    databaseUrl = process.env.DATABASE_URL,
    now = new Date()
} = {}) {
    if (!databaseUrl) throw new Error('DATABASE_URL is required for OAuth maintenance');
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new Error('OAuth maintenance requires PostgreSQL');
    }
    // A session advisory lock must stay on the same physical PostgreSQL connection.
    url.searchParams.set('connection_limit', '1');
    const prisma = new PrismaClient({ datasourceUrl: url.toString() });
    let locked = false;
    const deleted = { codes: 0, accessTokens: 0, refreshTokens: 0 };
    try {
        const [result] = await prisma.$queryRaw`
            SELECT pg_try_advisory_lock(${LOCK_NAMESPACE}::integer, ${LOCK_KEY}::integer) AS locked
        `;
        locked = result.locked;
        if (!locked) return { skipped: true, deleted };
        deleted.codes = await deleteExpiredRows(prisma.oAuthAuthorizationCode, now);
        deleted.accessTokens = await deleteExpiredRows(prisma.oAuthAccessToken, now);
        deleted.refreshTokens = await deleteExpiredRows(prisma.oAuthRefreshToken, now);
        return { skipped: false, deleted };
    } finally {
        try {
            if (locked) {
                await prisma.$queryRaw`
                    SELECT pg_advisory_unlock(${LOCK_NAMESPACE}::integer, ${LOCK_KEY}::integer)
                `;
            }
        } finally {
            await prisma.$disconnect();
        }
    }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    pruneExpiredOAuth()
        .then(result => {
            console.log(JSON.stringify(result));
        })
        .catch(() => {
            // Never print the connection string, token data or an ORM error containing them.
            console.error('OAuth maintenance failed');
            process.exitCode = 1;
        });
}
