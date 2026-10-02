import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import bcrypt from 'bcryptjs';

const databaseUrl = process.env.DATABASE_URL;
const baseUrl = process.env.TEST_BASE_URL;
const redisUrl = process.env.NUXT_REDIS_URL;
const enabled = Boolean(databaseUrl && baseUrl && redisUrl);
if (enabled) {
    const database = new URL(databaseUrl);
    const base = new URL(baseUrl);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.pathname.endsWith('_test')) {
        throw new Error('Admin integration requires an explicit database ending in _test');
    }
    if (!['http:', 'https:'].includes(base.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
        throw new Error('Admin integration requires a loopback TEST_BASE_URL');
    }
}

test('administrator HTTP boundaries use real PostgreSQL and Redis state', {
    skip: !enabled && 'Set DATABASE_URL, TEST_BASE_URL and NUXT_REDIS_URL for an isolated test application',
    timeout: 120_000
}, async t => {
    const prisma = new PrismaClient();
    const redis = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false });
    const base = new URL(baseUrl);
    const prefix = `ad_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const passwordHash = await bcrypt.hash('Admin-integration-password', 4);
    const userIds = [];
    const noticeIds = [];
    const showcaseIds = [];
    const sessionHashes = [];
    let managerCookie;
    let counter = 0;

    t.after(async () => {
        try {
            await prisma.notice.deleteMany({ where: { id: { in: noticeIds } } });
            await prisma.showcaseItem.deleteMany({ where: { id: { in: showcaseIds } } });
            await prisma.user.deleteMany({ where: { id: { in: userIds } } });
            const keys = [
                ...sessionHashes.map(hash => `cp-oauth:v2:auth:session:${hash}`),
                ...userIds.map(id => `cp-oauth:v2:auth:user-sessions:${id}`)
            ];
            if (keys.length && redis.status === 'ready') await redis.del(...keys);
        } finally {
            await prisma.$disconnect();
            redis.disconnect();
        }
    });
    await redis.connect();

    async function createUser(role = 'user', extra = {}) {
        const username = `${prefix}_${counter++}`;
        const user = await prisma.user.create({ data: {
            username, email: `${username}@admin-boundaries.example.test`,
            passwordHash, emailVerified: true, role, ...extra
        } });
        userIds.push(user.id);
        return user;
    }

    async function session(userId) {
        const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { authVersion: true } });
        const sid = randomBytes(32).toString('base64url');
        const hash = createHash('sha256').update(sid).digest('hex');
        sessionHashes.push(hash);
        await redis.set(`cp-oauth:v2:auth:session:${hash}`, JSON.stringify({ userId, authVersion: user.authVersion }), 'EX', 600);
        await redis.sadd(`cp-oauth:v2:auth:user-sessions:${userId}`, hash);
        await redis.expire(`cp-oauth:v2:auth:user-sessions:${userId}`, 600);
        return `cp_oauth_session=${sid}`;
    }

    async function request(path, { method = 'GET', body, cookie = managerCookie } = {}) {
        const response = await fetch(new URL(path, base), {
            method,
            redirect: 'manual',
            headers: {
                'X-CP-OAuth-CSRF': '1', Origin: base.origin, 'Sec-Fetch-Site': 'same-origin',
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                ...(cookie ? { Cookie: cookie } : {})
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const data = await response.json();
        if (method === 'POST' && path === '/api/admin/notices' && data.notice?.id) noticeIds.push(data.notice.id);
        if (method === 'POST' && path === '/api/admin/showcase' && data.item?.id) showcaseIds.push(data.item.id);
        return { response, data };
    }

    function validation(result, field) {
        assert.equal(result.response.status, 400);
        assert.equal(result.data.data.code, 'VALIDATION_ERROR');
        assert.equal(typeof result.data.data.fields[field], 'string');
        assert.doesNotMatch(JSON.stringify(result.data), /PrismaClient|node_modules|SELECT .* FROM/);
    }

    const manager = await createUser('admin');
    managerCookie = await session(manager.id);
    const ordinary = await createUser();
    const ordinaryCookie = await session(ordinary.id);

    await t.test('non-admin users cannot list, create or change administrative resources', async () => {
        for (const path of ['/api/admin/users', '/api/admin/notices', '/api/admin/showcase']) {
            assert.equal((await request(path, { cookie: ordinaryCookie })).response.status, 403);
        }
        const denied = await request(`/api/admin/users/${ordinary.id}`, {
            method: 'PATCH', cookie: ordinaryCookie, body: { role: 'admin' }
        });
        assert.equal(denied.response.status, 403);
        assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ordinary.id } })).role, 'user');
        const title = `${prefix}_unauthorized`;
        const notice = await request('/api/admin/notices', {
            method: 'POST', cookie: ordinaryCookie, body: { title, content: 'text', pinned: false }
        });
        assert.equal(notice.response.status, 403);
        assert.equal(await prisma.notice.count({ where: { title } }), 0);
        const name = `${prefix}_unauthorized`;
        const item = await request('/api/admin/showcase', {
            method: 'POST', cookie: ordinaryCookie,
            body: { category: 'site', name, url: 'https://example.test' }
        });
        assert.equal(item.response.status, 403);
        assert.equal(await prisma.showcaseItem.count({ where: { name } }), 0);
    });

    await t.test('invalid user patches are field errors and do not change role, verification or auth version', async () => {
        const select = { role: true, emailVerified: true, authVersion: true };
        const before = await prisma.user.findUniqueOrThrow({ where: { id: ordinary.id }, select });
        for (const [body, field] of [
            [{ role: 'owner' }, 'role'], [{ role: [] }, 'role'],
            [{ emailVerified: 'true' }, 'emailVerified'], [{ emailVerified: 'false' }, 'emailVerified'],
            [{ emailVerified: 1 }, 'emailVerified'], [{}, '_form'], [{ username: 'another_user' }, '_form']
        ]) {
            validation(await request(`/api/admin/users/${ordinary.id}`, { method: 'PATCH', body }), field);
            assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: ordinary.id }, select }), before);
        }
        const result = await request(`/api/admin/users/${ordinary.id}`, {
            method: 'PATCH', body: { emailVerified: false }
        });
        assert.equal(result.response.status, 200);
        assert.equal(result.data.emailVerified, false);
        assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ordinary.id } })).emailVerified, false);
    });

    await t.test('pagination stays stable when creation times tie and rejects invalid scalar queries', async () => {
        const marker = `pg_${prefix}`;
        const rows = [];
        for (let index = 0; index < 25; index++) {
            rows.push(await createUser('user', {
                username: `${marker}_${index}`,
                createdAt: new Date('2024-01-01T00:00:00Z')
            }));
        }
        const expected = rows.map(row => row.id).sort((a, b) => a > b ? -1 : a < b ? 1 : 0);
        const query = new URLSearchParams({ search: marker, page: '1' });
        const first = await request(`/api/admin/users?${query}`);
        assert.equal(first.response.status, 200);
        assert.equal(first.data.total, 25);
        assert.equal(first.data.pageSize, 20);
        assert.deepEqual(first.data.users.map(row => row.id), expected.slice(0, 20));
        query.set('page', '2');
        const second = await request(`/api/admin/users?${query}`);
        assert.equal(second.response.status, 200);
        assert.deepEqual(second.data.users.map(row => row.id), expected.slice(20));
        query.set('page', '1000000');
        const last = await request(`/api/admin/users?${query}`);
        assert.equal(last.response.status, 200);
        assert.deepEqual(last.data.users, []);
        assert.equal(last.data.total, 25);
        for (const raw of ['page=-1', 'page=0', 'page=1.5', 'page=1000001', 'page=NaN', 'page=1&page=2']) {
            validation(await request(`/api/admin/users?${raw}`), 'page');
        }
        validation(await request(`/api/admin/users?search=${'x'.repeat(101)}`), 'search');
        validation(await request('/api/admin/users?search=alice&search=bob'), 'search');
    });

    await t.test('role changes invalidate previous sessions and missing or deleted targets are 404', async () => {
        const target = await createUser();
        const initialCookie = await session(target.id);
        const promoted = await request(`/api/admin/users/${target.id}`, { method: 'PATCH', body: { role: 'admin' } });
        assert.equal(promoted.response.status, 200);
        assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).authVersion, target.authVersion + 1);
        assert.equal((await request('/api/auth/me', { cookie: initialCookie })).response.status, 401);
        const promotedCookie = await session(target.id);
        const demoted = await request(`/api/admin/users/${target.id}`, { method: 'PATCH', body: { role: 'user' } });
        assert.equal(demoted.response.status, 200);
        assert.equal((await request('/api/admin/users', { cookie: promotedCookie })).response.status, 401);
        const currentCookie = await session(target.id);
        const removed = await request(`/api/admin/users/${target.id}`, { method: 'DELETE' });
        assert.equal(removed.response.status, 200);
        assert.equal(await prisma.user.findUnique({ where: { id: target.id } }), null);
        assert.equal((await request('/api/auth/me', { cookie: currentCookie })).response.status, 401);
        for (const method of ['PATCH', 'DELETE']) {
            const result = await request(`/api/admin/users/${target.id}`, {
                method, ...(method === 'PATCH' ? { body: { emailVerified: true } } : {})
            });
            assert.equal(result.response.status, 404);
        }
        for (const resource of ['notices', 'showcase']) {
            assert.equal((await request(`/api/admin/${resource}/${randomUUID()}`, { method: 'DELETE' })).response.status, 404);
        }
    });

    await t.test('notice writes enforce byte and boolean limits, sanitize content and invalidate exact public cache', async () => {
        const title = `${prefix}_notice`;
        const before = await prisma.notice.count({ where: { title: { startsWith: prefix } } });
        for (const [patch, field] of [
            [{ title: 'x'.repeat(121) }, 'title'], [{ title: {} }, 'title'],
            [{ content: '中'.repeat(21_846) }, 'content'], [{ content: [] }, 'content'],
            [{ pinned: 'false' }, 'pinned'], [{ pinned: 1 }, 'pinned'], [{ extra: true }, '_form']
        ]) {
            validation(await request('/api/admin/notices', {
                method: 'POST', body: { title, content: 'text', pinned: false, ...patch }
            }), field);
        }
        assert.equal(await prisma.notice.count({ where: { title: { startsWith: prefix } } }), before);
        await request('/api/public/notices', { cookie: null });
        assert.equal(await redis.exists('public:notices'), 1);
        const created = await request('/api/admin/notices', {
            method: 'POST', body: {
                title, content: '<p><strong>Safe</strong><a href="javascript:alert(1)">Unsafe</a><script>alert(1)</script></p>',
                pinned: false
            }
        });
        assert.equal(created.response.status, 200);
        assert.equal(created.data.notice.pinned, false);
        assert.doesNotMatch(created.data.notice.content, /javascript:|<script/);
        assert.match(created.data.notice.content, /<strong>Safe<\/strong>/);
        assert.equal(await redis.exists('public:notices'), 0);
        const boundary = await request('/api/admin/notices', {
            method: 'POST', body: {
                title: `${prefix}_`.padEnd(120, 'x'), content: '中'.repeat(21_845) + 'a', pinned: true
            }
        });
        assert.equal(boundary.response.status, 200);
        await request('/api/public/notices', { cookie: null });
        assert.equal(await redis.exists('public:notices'), 1);
        const deleted = await request(`/api/admin/notices/${created.data.notice.id}`, { method: 'DELETE' });
        assert.equal(deleted.response.status, 200);
        assert.equal(await redis.exists('public:notices'), 0);
        assert.equal((await request(`/api/admin/notices/${created.data.notice.id}`, { method: 'DELETE' })).response.status, 404);
    });

    await t.test('showcase validates HTTP URLs and Int32 values without exposing or deleting unsafe historical links', async () => {
        const name = `${prefix}_showcase`;
        const body = { category: 'project', name, description: 'description', url: 'https://example.test/project', iconUrl: null, sortOrder: 0 };
        const before = await prisma.showcaseItem.count({ where: { name: { startsWith: prefix } } });
        for (const [patch, field] of [
            [{ name: 'x'.repeat(121) }, 'name'], [{ description: 'x'.repeat(2001) }, 'description'],
            [{ url: 'javascript:alert(1)' }, 'url'], [{ url: 'https://user:pass@example.test' }, 'url'],
            [{ url: {} }, 'url'], [{ iconUrl: 'data:image/svg+xml,x' }, 'iconUrl'],
            [{ category: 'other' }, 'category'], [{ sortOrder: '0' }, 'sortOrder'],
            [{ sortOrder: 1.5 }, 'sortOrder'], [{ sortOrder: 2_147_483_648 }, 'sortOrder'],
            [{ sortOrder: -2_147_483_649 }, 'sortOrder']
        ]) {
            validation(await request('/api/admin/showcase', { method: 'POST', body: { ...body, ...patch } }), field);
        }
        assert.equal(await prisma.showcaseItem.count({ where: { name: { startsWith: prefix } } }), before);
        const legacy = await prisma.showcaseItem.create({ data: {
            ...body, name: `${prefix}_legacy`, url: 'javascript:alert(1)', iconUrl: 'data:image/svg+xml,x'
        } });
        showcaseIds.push(legacy.id);
        await request('/api/public/showcase', { cookie: null });
        assert.equal(await redis.exists('public:showcase'), 1);
        const created = await request('/api/admin/showcase', { method: 'POST', body: {
            ...body, name: `${prefix}_`.padEnd(120, 'x'), description: 'x'.repeat(2000), sortOrder: -2_147_483_648
        } });
        assert.equal(created.response.status, 200);
        assert.equal(created.data.item.sortOrder, -2_147_483_648);
        assert.equal(await redis.exists('public:showcase'), 0);
        const maximum = await request('/api/admin/showcase', { method: 'POST', body: { ...body, sortOrder: 2_147_483_647 } });
        assert.equal(maximum.response.status, 200);
        const list = await request('/api/admin/showcase');
        const hidden = list.data.items.find(item => item.id === legacy.id);
        assert.equal(hidden.url, null);
        assert.equal(hidden.iconUrl, null);
        assert.deepEqual(hidden.invalidUrls, ['url', 'iconUrl']);
        const publicList = await request('/api/public/showcase', { cookie: null });
        const publicHidden = [...publicList.data.sites, ...publicList.data.projects].find(item => item.id === legacy.id);
        assert.equal(publicHidden.url, null);
        assert.equal(publicHidden.iconUrl, null);
        const unchanged = await prisma.showcaseItem.findUniqueOrThrow({ where: { id: legacy.id } });
        assert.equal(unchanged.url, legacy.url);
        assert.equal(unchanged.iconUrl, legacy.iconUrl);
        assert.equal((await request(`/api/admin/showcase/${created.data.item.id}`, { method: 'DELETE' })).response.status, 200);
        assert.equal(await redis.exists('public:showcase'), 0);
        assert.equal((await request(`/api/admin/showcase/${created.data.item.id}`, { method: 'DELETE' })).response.status, 404);
    });

    await t.test('the shared database guard refuses removal of the sole admin without changing other fixtures', async () => {
        const jiti = createJiti(import.meta.url, {
            alias: { '~': fileURLToPath(new URL('../../', import.meta.url)) }, fsCache: false
        });
        const { requireAnotherAdmin } = await jiti.import('../../server/utils/admin.ts');
        const { lockAdminRole } = await jiti.import('../../server/utils/role.ts');
        const { default: helperPrisma } = await jiti.import('../../server/utils/prisma.ts');
        if (helperPrisma !== prisma) t.after(() => helperPrisma.$disconnect());
        const before = await prisma.user.findMany({
            where: { role: 'admin' }, select: { id: true, role: true, authVersion: true }, orderBy: { id: 'asc' }
        });
        const rollback = new Error('Roll back the isolated final-admin fixture');
        await assert.rejects(prisma.$transaction(async tx => {
            await lockAdminRole(tx);
            // Other fixtures remain unchanged outside this deliberately rolled-back transaction.
            await tx.user.updateMany({
                where: { role: 'admin', id: { not: manager.id } }, data: { role: 'user' }
            });
            assert.equal(await tx.user.count({ where: { role: 'admin' } }), 1);
            await assert.rejects(requireAnotherAdmin(tx), error => {
                assert.equal(error.statusCode, 409);
                assert.equal(error.data.code, 'LAST_ADMIN');
                return true;
            });
            throw rollback;
        }), error => error === rollback);
        assert.deepEqual(await prisma.user.findMany({
            where: { role: 'admin' }, select: { id: true, role: true, authVersion: true }, orderBy: { id: 'asc' }
        }), before);
    });

    await t.test('two admins concurrently demoting each other leave an authorized admin and reject the stale actor', async () => {
        const alice = await createUser('admin');
        const bob = await createUser('admin');
        const [aliceCookie, bobCookie] = await Promise.all([session(alice.id), session(bob.id)]);
        const results = await Promise.all([
            request(`/api/admin/users/${bob.id}`, { method: 'PATCH', cookie: aliceCookie, body: { role: 'user' } }),
            request(`/api/admin/users/${alice.id}`, { method: 'PATCH', cookie: bobCookie, body: { role: 'user' } })
        ]);
        assert.equal(results.filter(result => result.response.status === 200).length, 1);
        assert.equal(results.filter(result => [401, 403].includes(result.response.status)).length, 1);
        const remaining = await prisma.user.findMany({ where: { id: { in: [alice.id, bob.id] } } });
        assert.equal(remaining.filter(user => user.role === 'admin').length, 1);
        const demoted = remaining.find(user => user.role === 'user');
        assert.equal(demoted.authVersion, 1);
        const staleCookie = demoted.id === alice.id ? aliceCookie : bobCookie;
        assert.equal((await request('/api/admin/users', { cookie: staleCookie })).response.status, 401);
    });

    await t.test('two admins concurrently deleting each other leave a real admin and deleted sessions stop working', async () => {
        const alice = await createUser('admin');
        const bob = await createUser('admin');
        const [aliceCookie, bobCookie] = await Promise.all([session(alice.id), session(bob.id)]);
        const results = await Promise.all([
            request(`/api/admin/users/${bob.id}`, { method: 'DELETE', cookie: aliceCookie }),
            request(`/api/admin/users/${alice.id}`, { method: 'DELETE', cookie: bobCookie })
        ]);
        assert.equal(results.filter(result => result.response.status === 200).length, 1);
        assert.equal(results.filter(result => [401, 403].includes(result.response.status)).length, 1);
        const remaining = await prisma.user.findMany({ where: { id: { in: [alice.id, bob.id] } } });
        assert.equal(remaining.length, 1);
        assert.equal(remaining[0].role, 'admin');
        const deletedCookie = remaining[0].id === alice.id ? bobCookie : aliceCookie;
        assert.equal((await request('/api/auth/me', { cookie: deletedCookie })).response.status, 401);
        assert.ok(await prisma.user.count({ where: { role: 'admin' } }) >= 1);
    });
});
