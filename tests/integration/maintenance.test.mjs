import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { pruneExpiredOAuth } from '../../scripts/prune-oauth.mjs';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !/^\/[^/]+_test$/.test(url.pathname)
    ) {
        throw new Error(
            'Maintenance integration requires a loopback PostgreSQL database ending in _test'
        );
    }
}

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const prismaPackage = createRequire(import.meta.url).resolve('prisma/package.json');
const prismaCli = resolve(
    dirname(prismaPackage),
    JSON.parse(readFileSync(prismaPackage, 'utf8')).bin.prisma
);
const hash = value => createHash('sha256').update(value).digest('hex');
const now = new Date('2040-01-02T03:04:05.678Z');
const expired = new Date(now.getTime() - 1);
const future = new Date(now.getTime() + 1);

// Each table has a live row before the first batch boundary and another after it.
// The equality row and last expired row fall into the second deletion batch.
const expiredRows = Array.from({ length: 1001 }, (_, index) => ({
    id: `row_${String(index).padStart(4, '0')}`,
    expiresAt: expired,
    inactive: index % 2 === 0
}));
const equalityRow = { id: 'row_0999_equal', expiresAt: now, inactive: false };
const liveRows = [
    { id: 'row_0000_live', expiresAt: future, inactive: false },
    { id: 'row_9999_live', expiresAt: future, inactive: true }
];

async function snapshot(prisma) {
    return {
        codes: await prisma.oAuthAuthorizationCode.findMany({ orderBy: { id: 'asc' } }),
        accessTokens: await prisma.oAuthAccessToken.findMany({ orderBy: { id: 'asc' } }),
        refreshTokens: await prisma.oAuthRefreshToken.findMany({ orderBy: { id: 'asc' } })
    };
}

async function seed(prisma, grant, rows) {
    await prisma.oAuthAuthorizationCode.createMany({
        data: rows.map(row => ({
            ...grant,
            id: row.id,
            codeHash: hash(`code:${row.id}`),
            redirectUri: 'https://maintenance.example.test/callback',
            expiresAt: row.expiresAt,
            used: row.inactive
        }))
    });
    await prisma.oAuthAccessToken.createMany({
        data: rows.map(row => ({
            ...grant,
            id: row.id,
            tokenHash: hash(`access:${row.id}`),
            expiresAt: row.expiresAt,
            clientAuthRequired: row.inactive
        }))
    });
    await prisma.oAuthRefreshToken.createMany({
        data: rows.map(row => ({
            ...grant,
            id: row.id,
            tokenHash: hash(`refresh:${row.id}`),
            expiresAt: row.expiresAt,
            revoked: row.inactive,
            clientAuthRequired: row.inactive
        }))
    });
}

test(
    'offline OAuth maintenance retains live grants and serializes competing jobs',
    {
        skip: !databaseUrl && 'Set TEST_DATABASE_URL to an isolated loopback _test database',
        timeout: 120_000
    },
    async t => {
        const schema = `maintenance_${randomUUID().replaceAll('-', '')}_test`;
        const adminUrl = new URL(databaseUrl);
        adminUrl.searchParams.set('schema', 'public');
        adminUrl.searchParams.set('connection_limit', '1');
        const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
        const fixtureUrl = new URL(databaseUrl);
        fixtureUrl.searchParams.set('schema', schema);
        fixtureUrl.searchParams.set('connection_limit', '1');
        const prisma = new PrismaClient({ datasourceUrl: fixtureUrl.toString() });
        let created = false;
        t.after(async () => {
            try {
                await prisma.$disconnect();
                if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
            } finally {
                await admin.$disconnect();
            }
        });
        await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        created = true;
        await run(process.execPath, [prismaCli, 'migrate', 'deploy'], {
            cwd: root,
            env: { ...process.env, DATABASE_URL: fixtureUrl.toString() },
            timeout: 60_000
        });
        const user = await prisma.user.create({
            data: {
                username: 'maintenance_fixture',
                email: 'maintenance@example.test',
                passwordHash: 'unused-maintenance-fixture-hash'
            }
        });
        const client = await prisma.oAuthClient.create({
            data: {
                userId: user.id,
                name: 'Maintenance fixture',
                clientSecretHash: 'unused-maintenance-client-hash',
                redirectUris: ['https://maintenance.example.test/callback']
            }
        });
        const grant = { userId: user.id, clientId: client.clientId, scopes: ['openid', 'profile'] };
        await seed(prisma, grant, [...expiredRows, equalityRow, ...liveRows]);
        const before = await snapshot(prisma);
        const expectedLive = Object.fromEntries(
            Object.entries(before).map(([table, rows]) => [
                table,
                rows.filter(row => liveRows.some(live => live.id === row.id))
            ])
        );
        // Deliberately request a larger pool; the maintenance client must override it to one.
        const maintenanceUrl = new URL(fixtureUrl);
        maintenanceUrl.searchParams.set('connection_limit', '8');

        await t.test(
            'expired and equality rows are removed across the 1000-row boundary, not future rows',
            async () => {
                const result = await pruneExpiredOAuth({
                    databaseUrl: maintenanceUrl.toString(),
                    now
                });
                assert.deepEqual(result, {
                    skipped: false,
                    deleted: { codes: 1002, accessTokens: 1002, refreshTokens: 1002 }
                });
                assert.deepEqual(await snapshot(prisma), expectedLive);
                // Idempotence also detects a cursor that loops on a deleted final row.
                assert.deepEqual(
                    await pruneExpiredOAuth({ databaseUrl: maintenanceUrl.toString(), now }),
                    {
                        skipped: false,
                        deleted: { codes: 0, accessTokens: 0, refreshTokens: 0 }
                    }
                );
                assert.deepEqual(await snapshot(prisma), expectedLive);
            }
        );

        await t.test(
            'a CLI contender exits successfully without touching any grant, and the next owner can prune',
            async () => {
                await seed(prisma, grant, [
                    {
                        id: 'lock_contender_expired',
                        expiresAt: new Date('2000-01-01T00:00:00Z'),
                        inactive: false
                    }
                ]);
                const beforeContention = await snapshot(prisma);
                const [lock] = await prisma.$queryRaw`
            SELECT pg_try_advisory_lock(20261001, 5) AS locked
        `;
                assert.equal(
                    lock.locked,
                    true,
                    'The previous maintenance owner released its session lock'
                );
                try {
                    const { stdout } = await run(process.execPath, ['scripts/prune-oauth.mjs'], {
                        cwd: root,
                        env: { ...process.env, DATABASE_URL: maintenanceUrl.toString() },
                        timeout: 20_000
                    });
                    assert.deepEqual(JSON.parse(stdout), {
                        skipped: true,
                        deleted: { codes: 0, accessTokens: 0, refreshTokens: 0 }
                    });
                    assert.deepEqual(await snapshot(prisma), beforeContention);
                } finally {
                    await prisma.$queryRaw`SELECT pg_advisory_unlock(20261001, 5)`;
                }
                assert.deepEqual(
                    await pruneExpiredOAuth({ databaseUrl: maintenanceUrl.toString(), now }),
                    {
                        skipped: false,
                        deleted: { codes: 1, accessTokens: 1, refreshTokens: 1 }
                    }
                );
                assert.deepEqual(await snapshot(prisma), expectedLive);
            }
        );
    }
);
