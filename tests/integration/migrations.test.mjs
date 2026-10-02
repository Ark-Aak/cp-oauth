import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { createJiti } from 'jiti';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as h3 from 'h3';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaPackage = JSON.parse(await readFile(prismaPackagePath, 'utf8'));
const prismaCli = path.resolve(path.dirname(prismaPackagePath), prismaPackage.bin.prisma);
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
let database;
try {
    database = new URL(databaseUrl || '');
} catch {
    throw new Error(
        'Migration tests require an explicit loopback PostgreSQL database ending in _test'
    );
}
if (
    !['postgresql:', 'postgres:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
    !/^\/[^/]+_test$/.test(decodeURIComponent(database.pathname))
) {
    throw new Error('Migration tests refuse non-loopback or non-_test databases');
}
// A failed Prisma engine can retain its cwd briefly on Windows. Fixture data must
// never be that cwd; keep one empty launcher directory for the whole suite.
const prismaCwd = await mkdtemp(path.join(tmpdir(), 'cp-oauth-prisma-cli-'));
after(async () => {
    await rm(prismaCwd, { recursive: true, force: true });
});
const jiti = createJiti(import.meta.url, { fsCache: false });
const crypto = await jiti.import('../../server/utils/secrets.ts');
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const baselineName = '20261001000000_baseline';
const securityName = '20261001000100_refactor_security';
const configKeys = [
    'smtp_pass',
    'turnstile_secret_key',
    'codeforces_client_secret',
    'github_client_secret',
    'google_client_secret',
    'clist_client_secret'
];

function child(args, env, cwd = root) {
    return new Promise(resolve => {
        execFile(
            process.execPath,
            args,
            {
                cwd,
                env: { ...process.env, ...env },
                encoding: 'utf8',
                timeout: 120000,
                maxBuffer: 2 * 1024 * 1024
            },
            (error, stdout, stderr) =>
                resolve({
                    status: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
                    stdout,
                    stderr
                })
        );
    });
}

async function withSchema(callback) {
    const schema = `migration_${randomUUID().replaceAll('-', '')}_test`;
    const scopedUrl = new URL(database);
    scopedUrl.searchParams.set('schema', schema);
    const control = new PrismaClient({
        datasources: { db: { url: database.toString() } },
        log: []
    });
    const db = new PrismaClient({ datasources: { db: { url: scopedUrl.toString() } }, log: [] });
    const directory = await mkdtemp(path.join(tmpdir(), 'cp-oauth-migrations-'));
    let created = false;
    try {
        await control.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        created = true;
        // The empty launcher cwd and copied schema prevent repository .env loading.
        await copyFile(
            path.join(root, 'prisma', 'baseline.prisma'),
            path.join(directory, 'schema.prisma')
        );
        await mkdir(path.join(directory, 'migrations', baselineName), { recursive: true });
        await copyFile(
            path.join(root, 'prisma', 'migrations', 'migration_lock.toml'),
            path.join(directory, 'migrations', 'migration_lock.toml')
        );
        await copyFile(
            path.join(root, 'prisma', 'migrations', baselineName, 'migration.sql'),
            path.join(directory, 'migrations', baselineName, 'migration.sql')
        );
        const deploy = () =>
            child(
                [prismaCli, 'migrate', 'deploy', '--schema', path.join(directory, 'schema.prisma')],
                { DATABASE_URL: scopedUrl.toString() },
                prismaCwd
            );
        const baseline = await deploy();
        assert.equal(baseline.status, 0, 'The baseline must deploy into the isolated schema');
        const security = async () => {
            await mkdir(path.join(directory, 'migrations', securityName));
            await copyFile(
                path.join(root, 'prisma', 'migrations', securityName, 'migration.sql'),
                path.join(directory, 'migrations', securityName, 'migration.sql')
            );
            return deploy();
        };
        const cli = async (mode, key) => {
            const result = await child(
                [path.join(root, 'scripts', 'refactor-data.mjs'), ...(mode ? [mode] : [])],
                {
                    DATABASE_URL: scopedUrl.toString(),
                    NUXT_DATA_ENCRYPTION_KEY: key ? Buffer.from(key).toString('base64') : ''
                }
            );
            const events = result.stdout
                .trim()
                .split('\n')
                .filter(Boolean)
                .map(line => JSON.parse(line));
            return {
                ...result,
                events,
                report: events.find(event => event.event === 'preflight'),
                complete: events.find(event => event.event === 'encryption_complete')
            };
        };
        await callback({ db, schema, security, cli, scopedUrl });
    } finally {
        await db.$disconnect();
        if (created) await control.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await control.$disconnect();
        await rm(directory, { recursive: true, force: true });
    }
}

async function insertUser(
    db,
    {
        id,
        username = id.replaceAll('-', '_'),
        email = `${id}@example.test`,
        role = 'user',
        configured = false,
        platforms = [],
        totp = null
    }
) {
    await db.$executeRawUnsafe(
        `
        INSERT INTO users (id, username, email, password_hash, role, public_linked_platforms_configured,
            public_linked_platforms, totp_secret, email_verified, email_verify_token, updated_at)
        VALUES ($1, $2, $3, 'fixture-password-hash', $4, $5, $6::text[], $7, true, $8, $9)
    `,
        id,
        username,
        email,
        role,
        configured,
        platforms,
        totp,
        `old-verification-${id}`,
        new Date('2026-01-01T00:00:00Z')
    );
}

async function insertLink(db, id, userId, platform, tokens = {}) {
    await db.$executeRawUnsafe(
        `
        INSERT INTO linked_accounts (id, user_id, platform, platform_uid,
            oauth_access_token, oauth_refresh_token, oauth_id_token)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
        id,
        userId,
        platform,
        `${userId}-${platform}`,
        tokens.access ?? null,
        tokens.refresh ?? null,
        tokens.id ?? null
    );
}

async function snapshot(db) {
    return JSON.stringify({
        users: await db.$queryRawUnsafe(
            'SELECT id, username, email, role, totp_secret, updated_at FROM users ORDER BY id'
        ),
        config: await db.$queryRawUnsafe('SELECT key, value FROM system_config ORDER BY key'),
        linked: await db.$queryRawUnsafe(
            'SELECT id, oauth_access_token, oauth_refresh_token, oauth_id_token FROM linked_accounts ORDER BY id'
        ),
        clients: await db.$queryRawUnsafe(
            'SELECT id, redirect_uris FROM oauth_clients ORDER BY id'
        ),
        showcase: await db.$queryRawUnsafe(
            'SELECT id, url, icon_url FROM showcase_items ORDER BY id'
        )
    });
}

function assertSafeOutput(result, values) {
    const output = result.stdout + result.stderr;
    for (const value of values.filter(Boolean)) {
        assert.ok(
            !output.includes(value),
            'CLI output must not expose an identity, URL, key, or secret value'
        );
    }
}

async function fixtureHttp(db, signingKey, callback) {
    const globals = [
        'defineEventHandler',
        'getHeader',
        'readBody',
        'setHeader',
        'setResponseStatus',
        'createError',
        'useRuntimeConfig',
        'cpOAuthPrisma'
    ];
    const saved = new Map(
        globals.map(name => [
            name,
            {
                present: Object.hasOwn(globalThis, name),
                value: globalThis[name]
            }
        ])
    );
    let server;
    try {
        for (const name of globals.slice(0, 6)) globalThis[name] = h3[name];
        globalThis.cpOAuthPrisma = db;
        globalThis.useRuntimeConfig = () => ({ jwtSecret: signingKey });
        const scopedJiti = createJiti(import.meta.url, {
            alias: { '~': root },
            fsCache: false,
            moduleCache: false
        });
        const { default: token } = await scopedJiti.import('../../server/api/oauth/token.post.ts');
        const { default: userinfo } = await scopedJiti.import(
            '../../server/api/oauth/userinfo.get.ts'
        );
        const { default: revoke } = await scopedJiti.import(
            '../../server/api/oauth/revoke.post.ts'
        );
        const router = h3.createRouter();
        router.post('/api/oauth/token', token);
        router.get('/api/oauth/userinfo', userinfo);
        router.post('/api/oauth/revoke', revoke);
        const app = h3.createApp({ debug: false });
        app.use(router);
        server = createServer(h3.toNodeListener(app));
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        const origin = `http://127.0.0.1:${server.address().port}`;
        const request = async (route, body, bearer) => {
            const response = await fetch(new URL(route, origin), {
                method: body === undefined ? 'GET' : 'POST',
                headers: {
                    ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
                    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
                },
                body: body ? new URLSearchParams(body) : undefined
            });
            return {
                status: response.status,
                data: await response.json(),
                headers: response.headers
            };
        };
        await callback(request);
    } finally {
        if (server) {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
        for (const [name, old] of saved) {
            if (old.present) globalThis[name] = old.value;
            else delete globalThis[name];
        }
    }
}

test(
    'real PostgreSQL legacy migration and offline encryption preserve consumer data',
    { timeout: 480000 },
    async t => {
        await t.test(
            'normalization ownership conflicts refuse read-only preflight and roll back migration',
            async () => {
                await withSchema(async ({ db, cli, security, scopedUrl }) => {
                    await insertUser(db, {
                        id: 'conflict-a',
                        username: ' Mixed_User ',
                        email: ' Owner@Example.Test ',
                        role: 'admin',
                        totp: 'legacy-totp-plaintext'
                    });
                    await insertUser(db, {
                        id: 'conflict-b',
                        username: 'mixed_user',
                        email: 'owner@example.test'
                    });
                    await db.$executeRawUnsafe(
                        'INSERT INTO system_config (key, value) VALUES ($1, $2)',
                        'smtp_pass',
                        'legacy-smtp-plaintext'
                    );
                    const before = await snapshot(db);
                    const check = await cli();
                    assert.equal(check.status, 1);
                    assert.equal(check.report.schemaVersion, 'legacy');
                    assert.deepEqual(check.report.usernameConflicts.ids, [
                        ['conflict-a', 'conflict-b']
                    ]);
                    assert.deepEqual(check.report.emailConflicts.ids, [
                        ['conflict-a', 'conflict-b']
                    ]);
                    assert.equal(check.report.secrets.plaintextCount, 2);
                    assert.ok(
                        before === (await snapshot(db)),
                        'Read-only conflict detection must not normalize or encrypt any row'
                    );
                    assertSafeOutput(check, [
                        scopedUrl.toString(),
                        'Mixed_User',
                        'Owner@Example.Test',
                        'legacy-totp-plaintext',
                        'legacy-smtp-plaintext'
                    ]);
                    const encrypt = await cli('--encrypt', randomBytes(32));
                    assert.equal(encrypt.status, 1);
                    assert.ok(
                        before === (await snapshot(db)),
                        'A blocked encryption invocation must write nothing'
                    );
                    const failedMigration = await security();
                    assert.notEqual(
                        failedMigration.status,
                        0,
                        'SQL migration must refuse conflicting ownership independently of the CLI'
                    );
                    assert.ok(
                        before === (await snapshot(db)),
                        'The migration must not partly normalize conflicting identities'
                    );
                    const [column] = await db.$queryRawUnsafe(`
                SELECT count(*)::int AS count FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'auth_version'
            `);
                    assert.equal(column.count, 0);
                });
            }
        );

        await t.test(
            'role and OAuth redirect blockers are actionable while unsafe showcase is only reported',
            async () => {
                await withSchema(async ({ db, cli, security, scopedUrl }) => {
                    await insertUser(db, { id: 'url-owner', role: 'admin' });
                    await insertUser(db, { id: 'illegal-role', role: 'owner' });
                    await db.$executeRawUnsafe(
                        `
                INSERT INTO oauth_clients (id, client_id, client_secret_hash, name, redirect_uris, user_id)
                VALUES ('unsafe-client', 'unsafe-public-id', 'fixture-hash', 'Fixture', $1::text[], 'url-owner')
            `,
                        [
                            'http://consumer.example.test/callback',
                            'https://user:private-password@consumer.example.test/callback'
                        ]
                    );
                    await db.$executeRawUnsafe(
                        `
                INSERT INTO showcase_items (id, category, name, description, url, icon_url, updated_at)
                VALUES ('unsafe-showcase', 'site', 'Fixture', '', $1, $2, $3)
            `,
                        'javascript:alert(1)',
                        'data:image/svg+xml,private-icon',
                        new Date('2026-01-01T00:00:00Z')
                    );
                    await db.$executeRawUnsafe(
                        'INSERT INTO system_config (key, value) VALUES ($1, $2)',
                        'smtp_pass',
                        'url-fixture-smtp-secret'
                    );
                    const before = await snapshot(db);
                    const blocked = await cli('--check');
                    assert.equal(blocked.status, 1);
                    assert.deepEqual(blocked.report.illegalRoles, {
                        count: 1,
                        ids: ['illegal-role']
                    });
                    assert.deepEqual(blocked.report.unsafeOAuthRedirects, {
                        count: 2,
                        ids: ['unsafe-client']
                    });
                    assert.deepEqual(blocked.report.unsafeShowcaseUrls, {
                        count: 1,
                        urlCount: 1,
                        iconUrlCount: 1,
                        ids: ['unsafe-showcase']
                    });
                    assert.ok(
                        before === (await snapshot(db)),
                        'Preflight must not repair historic data implicitly'
                    );
                    assertSafeOutput(blocked, [
                        scopedUrl.toString(),
                        'private-password',
                        'javascript:alert(1)',
                        'private-icon',
                        'url-fixture-smtp-secret'
                    ]);
                    await db.$executeRawUnsafe("UPDATE users SET role = 'user'");
                    const noAdmin = await cli('--check');
                    assert.equal(noAdmin.status, 1);
                    assert.equal(noAdmin.report.noAdmin, true);
                    assert.ok(noAdmin.report.blockers.includes('NO_ADMIN'));
                    await db.$executeRawUnsafe(
                        "UPDATE users SET role = 'admin' WHERE id = 'url-owner'"
                    );
                    await db.$executeRawUnsafe(
                        'UPDATE oauth_clients SET redirect_uris = $1::text[]',
                        ['https://consumer.example.test/callback']
                    );
                    const allowed = await cli('--check');
                    assert.equal(
                        allowed.status,
                        0,
                        'Unsafe historic showcase must be reportable without blocking lawful OAuth data'
                    );
                    assert.equal(allowed.report.unsafeShowcaseUrls.count, 1);
                    const legacyEncrypt = await cli('--encrypt', randomBytes(32));
                    assert.equal(
                        legacyEncrypt.status,
                        1,
                        'Encryption must require the tracked schema cutover first'
                    );
                    assert.ok(legacyEncrypt.stderr.includes('CURRENT_SCHEMA_REQUIRED'));
                    assert.equal((await security()).status, 0);
                    await db.$executeRawUnsafe(
                        'UPDATE oauth_clients SET redirect_uris = $1::text[]',
                        ['http://consumer.example.test/callback']
                    );
                    const currentBefore = await snapshot(db);
                    const refused = await cli('--encrypt', randomBytes(32));
                    assert.equal(refused.status, 1);
                    assert.equal(refused.report.schemaVersion, 'current');
                    assert.ok(
                        currentBefore === (await snapshot(db)),
                        'Unsafe current OAuth redirects must block before any canary or ciphertext write'
                    );
                });
            }
        );

        await t.test(
            'old raw credentials and configured visibility survive SQL cutover and actual OAuth HTTP handlers',
            async () => {
                await withSchema(async ({ db, cli, security, schema }) => {
                    const owner = 'legacy-admin';
                    const clientId = 'migration-client-public-id';
                    const clientSecret = 'migration-client-secret-fixture';
                    const redirectUri = 'http://127.0.0.1:4444/callback';
                    const verifier = 'm'.repeat(43);
                    const rawCode = 'migration-raw-code-fixture';
                    const rawRefresh = 'migration-raw-refresh-fixture';
                    const signingKey = randomBytes(32).toString('hex');
                    const expiry = new Date('2099-12-31T00:00:00Z');
                    const scopes = ['openid', 'profile', 'email'];
                    const rawAccess = jwt.sign(
                        {
                            sub: owner,
                            client_id: clientId,
                            scopes,
                            type: 'oauth_access',
                            iat: Math.floor(Date.now() / 1000),
                            exp: Math.floor(expiry.getTime() / 1000)
                        },
                        signingKey,
                        { algorithm: 'HS256' }
                    );
                    assert.equal(Object.hasOwn(jwt.decode(rawAccess), 'jti'), false);
                    await insertUser(db, {
                        id: owner,
                        username: ' Migration_Admin ',
                        email: ' Migration.Admin@Example.Test ',
                        role: 'admin',
                        platforms: ['google']
                    });
                    await insertUser(db, {
                        id: 'configured-empty',
                        configured: true,
                        platforms: []
                    });
                    await insertUser(db, {
                        id: 'configured-subset',
                        configured: true,
                        platforms: ['github']
                    });
                    await insertUser(db, { id: 'legacy-no-links', platforms: ['luogu'] });
                    for (const [id, userId, platform] of [
                        ['admin-luogu', owner, 'luogu'],
                        ['admin-github', owner, 'github'],
                        ['admin-atcoder', owner, 'atcoder'],
                        ['empty-luogu', 'configured-empty', 'luogu'],
                        ['subset-luogu', 'configured-subset', 'luogu'],
                        ['subset-github', 'configured-subset', 'github']
                    ])
                        await insertLink(db, id, userId, platform);
                    await db.$executeRawUnsafe(
                        `
                INSERT INTO oauth_clients (id, client_id, client_secret_hash, name, redirect_uris, user_id)
                VALUES ('migration-client-row', $1, $2, 'Migration fixture', $3::text[], $4)
            `,
                        clientId,
                        await bcrypt.hash(clientSecret, 4),
                        [redirectUri],
                        owner
                    );
                    await db.$executeRawUnsafe(
                        `
                INSERT INTO oauth_authorization_codes (id, code, client_id, user_id, scopes, redirect_uri,
                    code_challenge, code_challenge_method, expires_at)
                VALUES ('migration-code-row', $1, $2, $3, $4::text[], $5, $6, 'plain', $7)
            `,
                        rawCode,
                        clientId,
                        owner,
                        scopes,
                        redirectUri,
                        verifier,
                        expiry
                    );
                    await db.$executeRawUnsafe(
                        `
                INSERT INTO oauth_access_tokens (id, token, client_id, user_id, scopes, expires_at)
                VALUES ('migration-access-row', $1, $2, $3, $4::text[], $5)
            `,
                        rawAccess,
                        clientId,
                        owner,
                        scopes,
                        expiry
                    );
                    await db.$executeRawUnsafe(
                        `
                INSERT INTO oauth_refresh_tokens (id, token, client_id, user_id, scopes, expires_at)
                VALUES ('migration-refresh-row', $1, $2, $3, $4::text[], $5)
            `,
                        rawRefresh,
                        clientId,
                        owner,
                        scopes,
                        expiry
                    );
                    const legacyCheck = await cli('--check');
                    assert.equal(legacyCheck.status, 0);
                    assert.equal(legacyCheck.report.schemaVersion, 'legacy');
                    assert.equal((await security()).status, 0);
                    const code = await db.oAuthAuthorizationCode.findUnique({
                        where: { codeHash: hash(rawCode) }
                    });
                    assert.equal(code.id, 'migration-code-row');
                    assert.equal(code.codeChallengeHash, hash(verifier));
                    assert.equal(code.codeChallengeMethod, 'plain');
                    assert.equal(code.used, false);
                    assert.deepEqual(code.scopes, scopes);
                    assert.equal(code.expiresAt.getTime(), expiry.getTime());
                    const access = await db.oAuthAccessToken.findUnique({
                        where: { tokenHash: hash(rawAccess) }
                    });
                    const refresh = await db.oAuthRefreshToken.findUnique({
                        where: { tokenHash: hash(rawRefresh) }
                    });
                    assert.equal(access.id, 'migration-access-row');
                    assert.equal(refresh.id, 'migration-refresh-row');
                    assert.equal(access.clientAuthRequired, true);
                    assert.equal(refresh.clientAuthRequired, true);
                    assert.equal(refresh.revoked, false);
                    const users = await db.user.findMany({ orderBy: { id: 'asc' } });
                    const byId = new Map(users.map(user => [user.id, user]));
                    assert.deepEqual(byId.get(owner).publicLinkedPlatforms, [
                        'atcoder',
                        'github',
                        'luogu'
                    ]);
                    assert.deepEqual(byId.get('configured-empty').publicLinkedPlatforms, []);
                    assert.deepEqual(byId.get('configured-subset').publicLinkedPlatforms, [
                        'github'
                    ]);
                    assert.deepEqual(byId.get('legacy-no-links').publicLinkedPlatforms, []);
                    assert.equal(byId.get(owner).username, 'migration_admin');
                    assert.equal(byId.get(owner).email, 'migration.admin@example.test');
                    assert.equal(byId.get(owner).emailVerified, true);
                    assert.equal(byId.get(owner).emailVerifyToken, null);
                    const newcomer = await db.user.create({
                        data: {
                            id: 'new-private-user',
                            username: 'new_private_user',
                            email: 'new-private@example.test',
                            passwordHash: 'fixture-password-hash'
                        }
                    });
                    await db.linkedAccount.create({
                        data: {
                            userId: newcomer.id,
                            platform: 'github',
                            platformUid: 'new-private-github'
                        }
                    });
                    assert.deepEqual(
                        (await db.user.findUnique({ where: { id: newcomer.id } }))
                            .publicLinkedPlatforms,
                        []
                    );
                    const columns = await db.$queryRawUnsafe(
                        `
                SELECT table_name, column_name FROM information_schema.columns
                WHERE table_schema = $1 AND table_name IN ('users', 'oauth_authorization_codes', 'oauth_access_tokens', 'oauth_refresh_tokens')
            `,
                        schema
                    );
                    const columnNames = new Set(
                        columns.map(column => `${column.table_name}.${column.column_name}`)
                    );
                    for (const obsolete of [
                        'users.public_linked_platforms_configured',
                        'oauth_authorization_codes.code',
                        'oauth_authorization_codes.code_challenge',
                        'oauth_access_tokens.token',
                        'oauth_refresh_tokens.token'
                    ]) {
                        assert.equal(
                            columnNames.has(obsolete),
                            false,
                            'Obsolete plaintext credential and fallback columns must not remain'
                        );
                    }
                    await assert.rejects(
                        db.$executeRawUnsafe(
                            "UPDATE users SET role = 'owner' WHERE id = 'legacy-admin'"
                        )
                    );
                    await assert.rejects(
                        db.$executeRawUnsafe(
                            "UPDATE users SET username = ' Migration_Admin ' WHERE id = 'legacy-admin'"
                        )
                    );
                    await assert.rejects(
                        db.$executeRawUnsafe(
                            "UPDATE users SET email = ' Migration.Admin@Example.Test ' WHERE id = 'legacy-admin'"
                        )
                    );
                    const currentCheck = await cli('--check');
                    assert.equal(currentCheck.status, 0);
                    assert.equal(currentCheck.report.schemaVersion, 'current');

                    await fixtureHttp(db, signingKey, async request => {
                        const original = await request('/api/oauth/userinfo', undefined, rawAccess);
                        assert.equal(
                            original.status,
                            200,
                            'The original pre-migration JWT without jti must still authenticate over HTTP'
                        );
                        assert.equal(original.data.sub, owner);
                        assert.equal(original.data.username, 'migration_admin');
                        assert.equal(original.headers.get('cache-control'), 'no-store');
                        const codeBody = {
                            grant_type: 'authorization_code',
                            client_id: clientId,
                            redirect_uri: redirectUri,
                            code: rawCode,
                            code_verifier: 'n'.repeat(43)
                        };
                        const invalid = await request('/api/oauth/token', codeBody);
                        assert.equal(invalid.status, 400);
                        assert.equal(invalid.data.error, 'invalid_grant');
                        assert.equal(
                            (await db.oAuthAuthorizationCode.findUnique({ where: { id: code.id } }))
                                .used,
                            false
                        );
                        const exchanged = await request('/api/oauth/token', {
                            ...codeBody,
                            code_verifier: verifier
                        });
                        assert.equal(
                            exchanged.status,
                            200,
                            'The original raw code and plain verifier must exchange without reissuing credentials'
                        );
                        assert.equal(
                            (
                                await request(
                                    '/api/oauth/userinfo',
                                    undefined,
                                    exchanged.data.access_token
                                )
                            ).data.sub,
                            owner
                        );
                        const refreshBody = {
                            grant_type: 'refresh_token',
                            client_id: clientId,
                            refresh_token: rawRefresh
                        };
                        const missingSecret = await request('/api/oauth/token', refreshBody);
                        assert.equal(missingSecret.status, 401);
                        assert.equal(missingSecret.data.error, 'invalid_client');
                        assert.equal(
                            (await db.oAuthRefreshToken.findUnique({ where: { id: refresh.id } }))
                                .revoked,
                            false
                        );
                        const rotated = await request('/api/oauth/token', {
                            ...refreshBody,
                            client_secret: clientSecret
                        });
                        assert.equal(
                            rotated.status,
                            200,
                            'The original raw refresh token must remain usable with its existing secret requirement'
                        );
                        assert.equal(
                            (
                                await db.oAuthRefreshToken.findUnique({
                                    where: { tokenHash: hash(rotated.data.refresh_token) }
                                })
                            ).clientAuthRequired,
                            true
                        );
                        const replay = await request('/api/oauth/token', {
                            ...refreshBody,
                            client_secret: clientSecret
                        });
                        assert.equal(replay.status, 400);
                        assert.equal(replay.data.error, 'invalid_grant');
                        const revoked = await request('/api/oauth/revoke', {
                            client_id: clientId,
                            client_secret: clientSecret,
                            token: rawAccess,
                            token_type_hint: 'access_token'
                        });
                        assert.equal(revoked.status, 200);
                        assert.equal(
                            (await request('/api/oauth/userinfo', undefined, rawAccess)).status,
                            401
                        );
                    });
                });
            }
        );

        await t.test(
            'all runtime AAD fields encrypt in bounded batches, resume, and reject wrong keys without writes',
            async () => {
                await withSchema(async ({ db, cli, security, scopedUrl }) => {
                    const key = randomBytes(32);
                    const wrongKey = randomBytes(32);
                    await db.$executeRawUnsafe(
                        `
                INSERT INTO users (id, username, email, password_hash, role, totp_secret, updated_at)
                SELECT 'encrypt-user-' || lpad(i::text, 3, '0'), 'encrypt_user_' || i,
                    'encrypt-user-' || i || '@example.test', 'fixture-hash',
                    CASE WHEN i = 0 THEN 'admin' ELSE 'user' END, 'seed-fixture-' || i, $1
                FROM generate_series(0, 101) AS i
            `,
                        new Date('2026-01-01T00:00:00Z')
                    );
                    await insertUser(db, { id: 'empty-secret-user', totp: '' });
                    await insertLink(db, 'encrypted-link', 'encrypt-user-000', 'clist', {
                        access: 'provider-access-fixture',
                        refresh: 'provider-refresh-fixture',
                        id: 'provider-id-fixture'
                    });
                    await insertLink(db, 'empty-secret-link', 'empty-secret-user', 'github', {
                        access: '',
                        refresh: null,
                        id: ''
                    });
                    for (const configKey of configKeys) {
                        await db.$executeRawUnsafe(
                            'INSERT INTO system_config (key, value) VALUES ($1, $2)',
                            configKey,
                            `${configKey}-fixture-secret`
                        );
                    }
                    await db.$executeRawUnsafe(
                        'INSERT INTO system_config (key, value) VALUES ($1, $2)',
                        'site_title',
                        'Unchanged public title'
                    );
                    assert.equal((await security()).status, 0);
                    // A recoverable partial run can have ciphertext even before the key canary exists.
                    await db.$executeRawUnsafe(
                        'UPDATE system_config SET value = $1 WHERE key = $2',
                        crypto.encryptSecret(
                            'smtp_pass-fixture-secret',
                            'SystemConfig:smtp_pass',
                            key
                        ),
                        'smtp_pass'
                    );
                    for (const i of [0, 1]) {
                        const id = `encrypt-user-${String(i).padStart(3, '0')}`;
                        await db.$executeRawUnsafe(
                            'UPDATE users SET totp_secret = $1 WHERE id = $2',
                            crypto.encryptSecret(`seed-fixture-${i}`, `User:totpSecret:${id}`, key),
                            id
                        );
                    }
                    await db.$executeRawUnsafe(
                        'UPDATE linked_accounts SET oauth_id_token = $1 WHERE id = $2',
                        crypto.encryptSecret(
                            'provider-id-fixture',
                            'LinkedAccount:oauthIdToken:encrypted-link',
                            key
                        ),
                        'encrypted-link'
                    );
                    const partialBefore = await snapshot(db);
                    const absentCanaryWrongKey = await cli('--encrypt', wrongKey);
                    assert.equal(absentCanaryWrongKey.status, 1);
                    assert.equal(absentCanaryWrongKey.report.secrets.invalidEnvelopeCount, 4);
                    assert.equal(absentCanaryWrongKey.report.secrets.canaryPresent, false);
                    assert.ok(
                        partialBefore === (await snapshot(db)),
                        'Every existing envelope must validate before a missing canary is initialized'
                    );
                    const encrypted = await cli('--encrypt', key);
                    assert.equal(encrypted.status, 0);
                    assert.equal(encrypted.complete.encryptedCount, 107);
                    assert.equal(encrypted.complete.secrets.plaintextCount, 0);
                    assert.equal(encrypted.complete.secrets.envelopeCount, 111);
                    assert.equal(encrypted.complete.secrets.invalidEnvelopeCount, 0);
                    assert.equal(encrypted.complete.secrets.canaryVerified, true);
                    for (const configKey of configKeys) {
                        const row = await db.systemConfig.findUnique({ where: { key: configKey } });
                        assert.ok(
                            crypto.decryptSecret(row.value, `SystemConfig:${configKey}`, key) ===
                                `${configKey}-fixture-secret`,
                            'Configuration ciphertext must be readable by the exact runtime context'
                        );
                    }
                    for (const row of await db.user.findMany({
                        where: { id: { startsWith: 'encrypt-user-' } }
                    })) {
                        const i = Number(row.id.split('-').at(-1));
                        assert.ok(
                            crypto.decryptSecret(
                                row.totpSecret,
                                `User:totpSecret:${row.id}`,
                                key
                            ) === `seed-fixture-${i}`,
                            'TOTP ciphertext must be readable by its original user ID'
                        );
                    }
                    const linked = await db.linkedAccount.findUnique({
                        where: { id: 'encrypted-link' }
                    });
                    for (const [field, value] of [
                        ['oauthAccessToken', 'provider-access-fixture'],
                        ['oauthRefreshToken', 'provider-refresh-fixture'],
                        ['oauthIdToken', 'provider-id-fixture']
                    ]) {
                        assert.ok(
                            crypto.decryptSecret(
                                linked[field],
                                `LinkedAccount:${field}:${linked.id}`,
                                key
                            ) === value,
                            'Provider ciphertext must be readable by the exact field and account ID'
                        );
                    }
                    const canary = await db.systemConfig.findUnique({
                        where: { key: crypto.DATA_KEY_CHECK_KEY }
                    });
                    assert.ok(
                        crypto.decryptSecret(canary.value, crypto.DATA_KEY_CHECK_CONTEXT, key) ===
                            crypto.DATA_KEY_CHECK_VALUE
                    );
                    assert.equal(
                        (await db.user.findUnique({ where: { id: 'empty-secret-user' } }))
                            .totpSecret,
                        ''
                    );
                    const emptyLink = await db.linkedAccount.findUnique({
                        where: { id: 'empty-secret-link' }
                    });
                    assert.equal(emptyLink.oauthAccessToken, '');
                    assert.equal(emptyLink.oauthRefreshToken, null);
                    assert.equal(emptyLink.oauthIdToken, '');
                    assert.equal(
                        (await db.systemConfig.findUnique({ where: { key: 'site_title' } })).value,
                        'Unchanged public title'
                    );
                    const afterFirst = await snapshot(db);
                    const repeat = await cli('--encrypt', key);
                    assert.equal(repeat.status, 0);
                    assert.equal(repeat.complete.encryptedCount, 0);
                    assert.ok(
                        afterFirst === (await snapshot(db)),
                        'Same-key encryption must preserve existing ciphertext and metadata byte-for-byte'
                    );
                    const wrong = await cli('--encrypt', wrongKey);
                    assert.equal(wrong.status, 1);
                    assert.equal(wrong.report.secrets.canaryPresent, true);
                    assert.equal(wrong.report.secrets.canaryVerified, false);
                    assert.ok(
                        afterFirst === (await snapshot(db)),
                        'Wrong-key encryption must leave the canary and all fields untouched'
                    );
                    // Model a partially completed maintenance pass while preserving all older envelopes.
                    await db.user.update({
                        where: { id: 'empty-secret-user' },
                        data: { totpSecret: 'resumed-seed-fixture' }
                    });
                    const resumed = await cli('--encrypt', key);
                    assert.equal(resumed.status, 0);
                    assert.equal(resumed.complete.encryptedCount, 1);
                    assert.ok(
                        crypto.decryptSecret(
                            (await db.user.findUnique({ where: { id: 'empty-secret-user' } }))
                                .totpSecret,
                            'User:totpSecret:empty-secret-user',
                            key
                        ) === 'resumed-seed-fixture'
                    );
                    assert.ok(
                        (
                            await db.systemConfig.findUnique({
                                where: { key: crypto.DATA_KEY_CHECK_KEY }
                            })
                        ).value === canary.value
                    );
                    const beforeCheck = await snapshot(db);
                    const checked = await cli('--check', key);
                    assert.equal(checked.status, 0);
                    assert.equal(checked.report.secrets.plaintextCount, 0);
                    assert.equal(checked.report.secrets.invalidEnvelopeCount, 0);
                    assert.equal(checked.report.secrets.canaryVerified, true);
                    assert.ok(
                        beforeCheck === (await snapshot(db)),
                        'Final keyed --check remains read-only'
                    );
                    const sensitive = [
                        scopedUrl.toString(),
                        key.toString('base64'),
                        wrongKey.toString('base64'),
                        'seed-fixture-',
                        'provider-access-fixture',
                        'provider-refresh-fixture',
                        'provider-id-fixture',
                        'resumed-seed-fixture',
                        ...configKeys.map(configKey => `${configKey}-fixture-secret`)
                    ];
                    for (const result of [
                        absentCanaryWrongKey,
                        encrypted,
                        repeat,
                        wrong,
                        resumed,
                        checked
                    ]) {
                        assertSafeOutput(result, sensitive);
                    }
                });
            }
        );
    }
);
