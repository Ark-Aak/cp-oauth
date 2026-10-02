import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    createApp,
    createError,
    defineEventHandler,
    getHeader,
    readBody,
    setResponseHeader,
    toNodeListener
} from 'h3';
import { createJiti } from 'jiti';

const databaseUrl = process.env.CONFIG_TEST_DATABASE_URL;
const schema = `config_test_${randomUUID().replaceAll('-', '')}`;
if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !url.pathname.endsWith('_test')
    ) {
        throw new Error('CONFIG_TEST_DATABASE_URL must point to a loopback database ending in _test');
    }
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
}

const jiti = createJiti(import.meta.url, {
    alias: { '~': fileURLToPath(new URL('../', import.meta.url)) },
    fsCache: false
});
const { configPatchSchema, getConfig, getAdminConfig, updateConfig, requireRegistrationEnabled } =
    await jiti.import('../server/utils/config.ts');
const { parseInput } = await jiti.import('../server/utils/validation.ts');

function rejectsInvalidPatch(input) {
    assert.throws(() => parseInput(configPatchSchema, input), error => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.data.code, 'VALIDATION_ERROR');
        assert.ok(Object.keys(error.data.fields).length);
        return true;
    });
}

test('rejects unknown keys, wrong sections, and scalar type confusion', () => {
    for (const input of [
        { site_title: 'old DTO' },
        { values: { unknown_key: 'x' } },
        { values: { smtp_pass: 'must not be readable' } },
        { secrets: { site_title: 'not a secret' } },
        { secrets: { unknown_key: 'x' } },
        { clearSecrets: ['site_title'] },
        { clearSecrets: ['__data_key_check'] },
        { values: { registration_enabled: false } },
        { values: { turnstile_enabled: 'TRUE' } },
        { values: { smtp_host: [] } },
        { values: { site_title: {} } },
        { secrets: { smtp_pass: null } },
        { values: { smtp_port: 587 } },
        JSON.parse('{"values":{"__proto__":"x"}}'),
        [],
        null
    ]) rejectsInvalidPatch(input);
});

test('validates integer bounds and refuses partial numeric parses', () => {
    for (const [key, min, max] of [
        ['home_recent_users_count', 1, 20],
        ['smtp_port', 1, 65535],
        ['username_refresh_cooldown', 1, 43200]
    ]) {
        assert.equal(parseInput(configPatchSchema, { values: { [key]: String(min) } }).values[key], String(min));
        assert.equal(parseInput(configPatchSchema, { values: { [key]: String(max) } }).values[key], String(max));
        for (const value of [String(min - 1), String(max + 1), '1e1', '2.5', '10minutes', '']) {
            rejectsInvalidPatch({ values: { [key]: value } });
        }
    }
});

test('limits string config values and forbids simultaneous set and clear', () => {
    assert.equal(parseInput(configPatchSchema, { values: { site_title: 'x'.repeat(2048) } }).values.site_title.length, 2048);
    rejectsInvalidPatch({ values: { site_title: 'x'.repeat(2049) } });
    rejectsInvalidPatch({ secrets: { smtp_pass: 'x'.repeat(2049) } });
    rejectsInvalidPatch({ secrets: { smtp_pass: 'replacement' }, clearSecrets: ['smtp_pass'] });
    rejectsInvalidPatch({ secrets: { smtp_pass: '' }, clearSecrets: ['smtp_pass'] });
});

test('applies actual HTTP config mutations atomically and never exposes stored secrets', {
    skip: !databaseUrl && 'Set CONFIG_TEST_DATABASE_URL to a dedicated loopback _test database'
}, async t => {
    const { default: prisma } = await jiti.import('../server/utils/prisma.ts');
    const { encryptSecret, decryptSecret, DATA_KEY_CHECK_KEY, DATA_KEY_CHECK_CONTEXT, DATA_KEY_CHECK_VALUE } =
        await jiti.import('../server/utils/secrets.ts');
    const { verifyDataKeyCanary } = await jiti.import('../server/utils/data-encryption.ts');
    const key = randomBytes(32);
    let activeKey = key.toString('base64');
    const globals = { defineEventHandler, createError, getHeader, readBody, setResponseHeader,
        useRuntimeConfig: () => ({ dataEncryptionKey: activeKey }) };
    const originals = Object.fromEntries(Object.keys(globals).map(name => [name, globalThis[name]]));
    Object.assign(globalThis, globals);
    let server;

    try {
        await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}".system_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
        await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}".users (id TEXT PRIMARY KEY, role TEXT NOT NULL)`);
        await prisma.$executeRaw`INSERT INTO users (id, role) VALUES ('config-admin', 'admin')`;
        await prisma.systemConfig.create({ data: { key: 'unknown_private_key', value: 'never expose' } });

        const { default: adminHandler } = await jiti.import('../server/api/admin/config.ts');
        const { default: publicHandler } = await jiti.import('../server/api/public/config.get.ts');
        const app = createApp({ debug: false });
        // The authentication suite covers cookie validation; this fixture supplies its validated context.
        app.use(defineEventHandler(event => {
            event.context.authUserId = 'config-admin';
            event.context.authSessionId = 'config-fixture-session';
            event.context.authVersion = 0;
            event.context.authRole = 'admin';
        }));
        app.use('/api/admin/config', adminHandler);
        app.use('/api/public/config', publicHandler);
        server = createServer(toNodeListener(app));
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const request = async (path, patch) => {
            const response = await fetch(`${origin}${path}`, patch === undefined ? {} : {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch)
            });
            return { response, body: await response.json() };
        };

        await t.test('persists ciphertext and returns configured flags rather than secrets', async () => {
            const { response, body } = await request('/api/admin/config', {
                values: { smtp_host: 'smtp.example.test', github_client_id: 'test-client' },
                secrets: { smtp_pass: 'private-smtp-password', github_client_secret: 'private-provider-secret' }
            });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.deepEqual(body.secrets.smtp_pass, { configured: true });
            assert.equal(Object.hasOwn(body.values, 'smtp_pass'), false);
            const stored = await prisma.systemConfig.findUnique({ where: { key: 'smtp_pass' } });
            assert.notEqual(stored.value, 'private-smtp-password');
            assert.equal(decryptSecret(stored.value, 'SystemConfig:smtp_pass', key), 'private-smtp-password');
            assert.equal((await getConfig(['smtp_pass'])).smtp_pass, 'private-smtp-password');
            const read = await request('/api/admin/config');
            assert.equal(JSON.stringify(read.body).includes('private-smtp-password'), false);
            assert.equal(JSON.stringify(read.body).includes('private-provider-secret'), false);
            assert.equal(JSON.stringify(read.body).includes('unknown_private_key'), false);
        });

        await t.test('empty secret leaves the stored envelope unchanged; explicit clear removes it', async () => {
            const before = await prisma.systemConfig.findUnique({ where: { key: 'smtp_pass' } });
            const empty = await request('/api/admin/config', { secrets: { smtp_pass: '' } });
            assert.equal(empty.response.status, 200);
            assert.equal((await prisma.systemConfig.findUnique({ where: { key: 'smtp_pass' } })).value, before.value);
            const cleared = await request('/api/admin/config', { clearSecrets: ['smtp_pass'] });
            assert.equal(cleared.response.status, 200);
            assert.deepEqual(cleared.body.secrets.smtp_pass, { configured: false });
            assert.equal((await prisma.systemConfig.findUnique({ where: { key: 'smtp_pass' } })).value, '');
        });

        await t.test('invalid whole requests and missing dependencies commit no changed values', async () => {
            const before = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
            for (const patch of [
                { values: { site_title: 'must not commit', smtp_port: '0' } },
                { values: { site_title: 'must not commit', unknown_key: 'x' } },
                { values: { site_title: 'must not commit' }, secrets: { smtp_pass: 'x' }, clearSecrets: ['smtp_pass'] },
                { values: { site_title: 'must not commit', turnstile_enabled: 'true' } }
            ]) {
                const result = await request('/api/admin/config', patch);
                assert.equal(result.response.status, 400);
                assert.equal(result.body.data.code, 'VALIDATION_ERROR');
                assert.deepEqual(await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } }), before);
            }
        });

        await t.test('a database failure rolls back an earlier valid upsert in the same PATCH', async () => {
            await prisma.$executeRawUnsafe(`ALTER TABLE "${schema}".system_config ADD CONSTRAINT config_smoke_failure CHECK (key <> 'smtp_port' OR value <> '999')`);
            const before = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
            const result = await request('/api/admin/config', { values: { site_title: 'must roll back', smtp_port: '999' } });
            assert.equal(result.response.status, 500);
            assert.deepEqual(await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } }), before);
            await prisma.$executeRawUnsafe(`ALTER TABLE "${schema}".system_config DROP CONSTRAINT config_smoke_failure`);
        });

        await t.test('public login gates require both provider credentials and Turnstile keys', async () => {
            const enabled = await request('/api/public/config');
            assert.equal(enabled.response.headers.get('cache-control'), 'no-store');
            assert.equal(enabled.body.githubLoginEnabled, true);
            assert.equal(JSON.stringify(enabled.body).includes('private-provider-secret'), false);
            await updateConfig('config-admin', { clearSecrets: ['github_client_secret'] });
            assert.equal((await request('/api/public/config')).body.githubLoginEnabled, false);
            await updateConfig('config-admin', {
                values: { turnstile_enabled: 'true', turnstile_site_key: 'site-key' },
                secrets: { turnstile_secret_key: 'turnstile-secret' }
            });
            assert.equal((await request('/api/public/config')).body.turnstileEnabled, true);
            const rejected = await request('/api/admin/config', { clearSecrets: ['turnstile_secret_key'] });
            assert.equal(rejected.response.status, 400);
            assert.equal((await getAdminConfig()).secrets.turnstile_secret_key.configured, true);
        });

        await t.test('registration gate reads current transactional configuration', async () => {
            await updateConfig('config-admin', { values: { registration_enabled: 'false' } });
            await assert.rejects(requireRegistrationEnabled(), { statusCode: 403 });
            await prisma.$transaction(async tx => {
                await tx.systemConfig.upsert({ where: { key: 'registration_enabled' }, update: { value: 'true' }, create: { key: 'registration_enabled', value: 'true' } });
                await requireRegistrationEnabled(tx);
            });
        });

        await t.test('rechecks actor privileges after acquiring the role lock', async () => {
            await prisma.$executeRaw`UPDATE users SET role = 'user' WHERE id = 'config-admin'`;
            const before = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
            await assert.rejects(updateConfig('config-admin', { values: { site_title: 'forbidden' } }), { statusCode: 403 });
            assert.deepEqual(await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } }), before);
            await prisma.$executeRaw`UPDATE users SET role = 'admin' WHERE id = 'config-admin'`;
        });

        await t.test('wrong keys and plaintext secrets fail closed, and canary is mandatory', async () => {
            await assert.rejects(verifyDataKeyCanary(key));
            await prisma.systemConfig.create({ data: { key: DATA_KEY_CHECK_KEY, value: encryptSecret(DATA_KEY_CHECK_VALUE, DATA_KEY_CHECK_CONTEXT, key) } });
            await verifyDataKeyCanary(key);
            await assert.rejects(verifyDataKeyCanary(randomBytes(32)));
            activeKey = randomBytes(32).toString('base64');
            assert.equal((await request('/api/admin/config')).response.status, 503);
            activeKey = key.toString('base64');
            await prisma.systemConfig.update({ where: { key: 'turnstile_secret_key' }, data: { value: 'legacy plaintext' } });
            assert.equal((await request('/api/public/config')).response.status, 503);
        });
    } finally {
        if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await prisma.$disconnect();
        for (const [name, value] of Object.entries(originals)) {
            if (value === undefined) delete globalThis[name];
            else globalThis[name] = value;
        }
    }
});
