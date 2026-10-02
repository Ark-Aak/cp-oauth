import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, mock, test } from 'node:test';
import childProcess, { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { Writable } from 'node:stream';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApp, createRouter, toNodeListener } from 'h3';
import { createJiti } from 'jiti';

const originalRedis = globalThis.cpOAuthRedis;
const originalRuntime = globalThis.useRuntimeConfig;
const originalFetch = globalThis.$fetch;
const originalDefineEventHandler = globalThis.defineEventHandler;
let provider;
let active = 0;
let maximumActive = 0;
let requests = [];

// Keep fixed-host HTTP fixtures at the subprocess boundary; production URLs stay unchanged.
mock.method(childProcess, 'execFile', (_binary, _args, _options, callback) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    const chunks = [];
    return {
        stdin: new Writable({
            write(chunk, _encoding, done) { chunks.push(chunk); done(); },
            final(done) {
                const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                requests.push(input);
                Promise.resolve().then(() => provider(input)).then(result => {
                    active -= 1;
                    callback(null, JSON.stringify(result), '');
                    done();
                }, error => {
                    active -= 1;
                    callback(error, '', '');
                    done();
                });
            }
        })
    };
});
syncBuiltinESMExports();

const jiti = createJiti(import.meta.url, {
    alias: { '~': fileURLToPath(new URL('../', import.meta.url)) }, fsCache: false
});
const {
    fetchClistAccounts, filterAccountsByBoundIdentities, filterStatisticsByBoundAccounts
} = await jiti.import('../server/utils/clist-api.ts');
const { clistFetch } = await jiti.import('../server/utils/clist-fetch.ts');

beforeEach(() => {
    active = 0;
    maximumActive = 0;
    requests = [];
    provider = () => { throw new Error('Unexpected provider request'); };
    const cache = new Map();
    globalThis.cpOAuthRedis = {
        get: async key => {
            const entry = cache.get(key);
            return entry && entry.expiresAt > Date.now() ? entry.value : null;
        },
        set: async (key, value, mode, ttl) => {
            cache.set(key, { value, expiresAt: mode === 'EX' ? Date.now() + ttl * 1000 : Infinity });
            return 'OK';
        },
        ttl: async key => {
            const entry = cache.get(key);
            return entry ? Math.floor((entry.expiresAt - Date.now()) / 1000) : -2;
        }
    };
});
afterEach(() => {
    globalThis.cpOAuthRedis = originalRedis;
    globalThis.useRuntimeConfig = originalRuntime;
    globalThis.$fetch = originalFetch;
    globalThis.defineEventHandler = originalDefineEventHandler;
});
after(() => { mock.restoreAll(); syncBuiltinESMExports(); });

function account(id, resource, handle, extra = {}) {
    return { id, resource, resource_id: 1, handle, name: null, rating: 1900,
        n_contests: 25, resource_rank: null, last_activity: null, ...extra };
}

function statistic(id, accountId, extra = {}) {
    return { id, account_id: accountId, handle: 'alice', contest_id: id,
        event: `Contest ${id}`, date: '2026-09-20T12:00:00Z', place: 10, score: null,
        new_rating: 1900, old_rating: 1800, rating_change: 100, ...extra };
}

test('identity matching never discloses another account on a bound resource', () => {
    const accounts = [
        account(1, 'codeforces.com', 'ALICE'),
        account(2, 'codeforces.com', 'bob', { name: 'Alice' }),
        account(3, 'atcoder.jp', 'Verified_UID'),
        account(4, 'atcoder.jp', 'display_nickname'),
        account(5, 'luogu.com.cn', '000123'),
        account(6, 'luogu.com.cn', '009007199254740993'),
        account(7, 'luogu.com.cn', '9007199254740992'),
        account(8, 'luogu.com.cn', 'nickname'),
        account(9, 'leetcode.com', 'alice'),
        account(10, 'codeforces.com.evil', 'alice'),
        account(11, '__proto__', 'alice')
    ];
    const bindings = [
        { platform: 'codeforces', platformUid: 'provider-sub', platformUsername: 'Alice' },
        { platform: 'atcoder', platformUid: 'verified_uid', platformUsername: 'display_nickname' },
        { platform: 'luogu', platformUid: '123', platformUsername: 'nickname' },
        { platform: 'luogu', platformUid: '9007199254740993', platformUsername: null },
        { platform: 'leetcode', platformUid: 'alice', platformUsername: 'alice' }
    ];
    const matched = filterAccountsByBoundIdentities(accounts, bindings);
    assert.deepEqual(matched.map(value => value.id), [1, 3, 5, 6]);
    const history = [statistic(1, 1), statistic(2, 2), statistic(3, 3), statistic(4, 9)];
    assert.deepEqual(filterStatisticsByBoundAccounts(history,
        new Set(matched.map(value => value.id))).map(value => value.id), [1, 3]);
    assert.deepEqual(filterAccountsByBoundIdentities(accounts, []), []);
    assert.deepEqual(filterAccountsByBoundIdentities(accounts, [
        { platform: 'codeforces', platformUid: 'alice', platformUsername: null },
        { platform: 'luogu', platformUid: 'nickname', platformUsername: '123' }
    ]), []);
});

test('tokens with identical suffixes keep separate accounts and concurrent misses share one request', async () => {
    provider = async input => {
        const token = input.headers.Authorization.slice('Bearer '.length);
        const alice = token.startsWith('alice-');
        return { status: 200, error: null, body: JSON.stringify({
            id: alice ? 101 : 202,
            accounts: [account(alice ? 1 : 2, 'codeforces.com', alice ? 'alice' : 'bob')]
        }) };
    };
    const suffix = 'same-last-12';
    const alice = await fetchClistAccounts(`alice-${suffix}`);
    const bob = await fetchClistAccounts(`bob-${suffix}`);
    assert.deepEqual(alice.map(value => value.handle), ['alice']);
    assert.deepEqual(bob.map(value => value.handle), ['bob']);
    const parallel = await Promise.all(Array.from({ length: 20 },
        () => fetchClistAccounts(`alice-concurrent-${suffix}`)));
    assert.ok(parallel.every(value => value[0].handle === 'alice'));
    assert.equal(requests.filter(value => value.headers.Authorization ===
        `Bearer alice-concurrent-${suffix}`).length, 1);
});

test('a rejected Clist request is not retained as a permanently rejected cache miss', async () => {
    let failing = true;
    provider = async () => failing ? { status: 0, body: '', error: 'network' } :
        { status: 200, error: null, body: JSON.stringify({ id: 1, accounts: [] }) };
    await assert.rejects(fetchClistAccounts('retry-after-rejected-provider'), { statusCode: 502 });
    failing = false;
    assert.deepEqual(await fetchClistAccounts('retry-after-rejected-provider'), []);
});

test('Clist fixed-host transport fails closed and bounds overload without leaking process output', async () => {
    for (const url of ['http://clist.by/', 'https://evil.test/', 'https://clist.by.evil/',
        'https://user:pass@clist.by/', 'https://clist.by:444/', 'https://clist.by/#secret']) {
        await assert.rejects(clistFetch({ method: 'GET', url }), { statusCode: 502 });
    }
    assert.equal(requests.length, 0);
    const release = [];
    provider = () => new Promise(resolve => release.push(() => resolve({
        status: 403, body: 'Authentication required', error: null
    })));
    const pending = Array.from({ length: 20 }, () => clistFetch({ method: 'GET',
        url: 'https://clist.by/api/v4/json/coder/me/' }));
    await assert.rejects(clistFetch({ method: 'GET', url: 'https://clist.by/' }), { statusCode: 503 });
    for (let completed = 0; completed < 20;) {
        await new Promise(resolve => setImmediate(resolve));
        const batch = release.splice(0);
        for (const finish of batch) { finish(); completed += 1; }
    }
    assert.deepEqual((await Promise.all(pending)).map(value => value.status), Array(20).fill(403));
    assert.equal(maximumActive, 4);
});

const enabled = !!process.env.DATABASE_URL && !!process.env.NUXT_REDIS_URL;
if (enabled) {
    for (const [key, suffix] of [['DATABASE_URL', '_test'], ['NUXT_REDIS_URL', null]]) {
        const url = new URL(process.env[key]);
        if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
            (suffix && !decodeURIComponent(url.pathname).endsWith(suffix))) {
            throw new Error('Privacy fixtures require loopback Redis and an isolated _test database');
        }
    }
}

test('public day counts stay atomic and unavailable Redis never becomes a fabricated zero',
    { skip: !enabled }, async () => {
    globalThis.useRuntimeConfig = () => ({ redisUrl: process.env.NUXT_REDIS_URL });
    globalThis.cpOAuthRedis = undefined;
    const { default: prisma } = await jiti.import('../server/utils/prisma.ts');
    const { getRedis } = await jiti.import('../server/utils/redis.ts');
    const { incrementOAuthLoginRequestCount, getTodayOAuthLoginRequestCount, getPublicSiteStats } =
        await jiti.import('../server/utils/stats.ts');
    const redis = getRedis();
    const year = 2200 + randomBytes(2).readUInt16BE() % 7000;
    const date = new Date(Date.UTC(year, 0, 1, 12));
    const nextDate = new Date(Date.UTC(year, 0, 2, 12));
    const day = `${year}-01-01`;
    const keys = [`stats:oauth-login-requests:${day}`, `public:stats:v2:${day}`,
        `public:stats:v2:${year}-01-02`];
    let ownsKeys = false;
    try {
        if (redis.status !== 'ready') await new Promise((resolve, reject) => {
            redis.once('ready', resolve); redis.once('error', reject);
        });
        if (await redis.exists(...keys)) throw new Error('The public statistics fixture date is already in use');
        ownsKeys = true;
        assert.equal(await getTodayOAuthLoginRequestCount(date), 0);
        await Promise.all(Array.from({ length: 40 }, () => incrementOAuthLoginRequestCount(date)));
        assert.equal(await getTodayOAuthLoginRequestCount(date), 40);
        const ttl = await redis.ttl(keys[0]);
        assert.ok(ttl > 47 * 60 * 60 && ttl <= 48 * 60 * 60);
        const snapshot = await getPublicSiteStats(date);
        assert.equal(snapshot.oauthLoginRequestsToday, 40);
        globalThis.cpOAuthRedis = {
            get: async () => { throw new Error('Offline'); },
            set: async () => { throw new Error('Offline'); },
            eval: async () => { throw new Error('Offline'); }
        };
        assert.deepEqual(await getPublicSiteStats(date), snapshot);
        await assert.rejects(getTodayOAuthLoginRequestCount(date), { statusCode: 503 });
        await assert.rejects(getPublicSiteStats(nextDate), { statusCode: 503 });
        await incrementOAuthLoginRequestCount(date);
        globalThis.cpOAuthRedis = redis;
        assert.equal(await getTodayOAuthLoginRequestCount(date), 40);
    } finally {
        globalThis.cpOAuthRedis = redis;
        if (ownsKeys) await redis.del(...keys);
        await redis.quit().catch(() => redis.disconnect());
        await prisma.$disconnect();
    }
});

test('hitokoto retains the real last-good quote and coalesces misses through a failure cooldown', async t => {
    const { defineEventHandler } = await import('h3');
    globalThis.defineEventHandler = defineEventHandler;
    let calls = 0;
    let failing = false;
    globalThis.$fetch = async () => {
        calls += 1;
        if (failing) throw new Error('Upstream unavailable');
        return { hitokoto: 'A real fixed-fixture quote', from: 'Fixture source', from_who: 'Author' };
    };
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-01T12:00:00Z') });
    try {
        const { default: handler } = await jiti.import('../server/api/public/hitokoto.get.ts');
        const results = await Promise.all(Array.from({ length: 20 }, () => handler({})));
        const expected = { text: 'A real fixed-fixture quote', source: 'Fixture source', fromWho: 'Author' };
        assert.ok(results.every(result => JSON.stringify(result) === JSON.stringify(expected)));
        assert.equal(calls, 1);
        failing = true;
        t.mock.timers.tick(301_000);
        assert.deepEqual(await handler({}), expected);
        await Promise.all(Array.from({ length: 20 }, () => handler({})));
        assert.equal(calls, 2);
        t.mock.timers.tick(60_001);
        assert.deepEqual(await handler({}), expected);
        assert.equal(calls, 3);
    } finally {
        t.mock.timers.reset();
    }
});

test('live public JSON/SVG respect the explicit list, fast queries and upstream availability',
    { skip: !enabled }, async () => {
    const key = randomBytes(32);
    globalThis.useRuntimeConfig = () => ({ dataEncryptionKey: key.toString('base64'),
        redisUrl: process.env.NUXT_REDIS_URL,
        public: { siteOrigin: 'https://canonical.example.test' } });
    globalThis.cpOAuthRedis = undefined;
    const { default: prisma } = await jiti.import('../server/utils/prisma.ts');
    const { getRedis } = await jiti.import('../server/utils/redis.ts');
    const { encryptSecret } = await jiti.import('../server/utils/secrets.ts');
    const { hashToken } = await jiti.import('../server/utils/token-hash.ts');
    const { getPublicProfile } = await jiti.import('../server/utils/public-profile.ts');
    const { default: baseHandler } = await jiti.import('../server/api/users/[username].get.ts');
    const { default: statsHandler } = await jiti.import('../server/api/users/[username]/stats.get.ts');
    const h3 = await import('h3');
    const globals = {};
    for (const name of ['defineEventHandler', 'getRouterParam', 'getQuery', 'createError',
        'setResponseHeader', 'setResponseHeaders']) {
        globals[name] = globalThis[name];
        globalThis[name] = h3[name];
    }
    const { default: svgHandler } = await jiti.import('../server/api/users/[username]/card.svg.get.ts');
    const router = createRouter();
    router.get('/api/users/:username', baseHandler);
    router.get('/api/users/:username/stats', statsHandler);
    router.get('/api/users/:username/card.svg', svgHandler);
    const app = createApp({ debug: false });
    app.use(router);
    const server = createServer(toNodeListener(app));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const username = `privacy_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const linkedId = randomUUID();
    const token = `privacy-provider-${randomUUID()}`;
    const redis = getRedis();
    let userId;
    try {
        if (redis.status !== 'ready') await new Promise((resolve, reject) => {
            redis.once('ready', resolve); redis.once('error', reject);
        });
        const user = await prisma.user.create({ data: { username, email: `${username}@example.test`,
            passwordHash: 'not-a-login-hash',
            linkedAccounts: { create: [
                { platform: 'codeforces', platformUid: `${username}-sub`, platformUsername: 'Alice' },
                { id: linkedId, platform: 'clist', platformUid: username,
                    platformUsername: username, oauthAccessToken: 'enc:v1:invalid:invalid:invalid' }
            ] }
        } });
        userId = user.id;
        assert.equal((await getPublicProfile(` ${username.toUpperCase()} `)).profile.id, user.id);
        const endpoint = `${origin}/api/users/${username}`;
        const initial = await fetch(endpoint);
        assert.equal(initial.status, 200);
        assert.equal(initial.headers.get('cache-control'), 'no-store');
        const initialBody = await initial.json();
        assert.deepEqual(initialBody.linkedAccounts, []);
        assert.equal('cpStatsStatus' in initialBody, false);
        assert.equal('ratingHistoryStatus' in initialBody, false);
        assert.equal(requests.length, 0);

        await prisma.user.update({ where: { id: user.id }, data: {
            publicLinkedPlatforms: ['codeforces'], publicCpStats: true, publicRatingHistory: true
        } });
        const fast = await fetch(`${endpoint}?includeStats=false`);
        const fastBody = await fast.json();
        assert.equal(fast.status, 200);
        assert.deepEqual(fastBody.linkedAccounts, [
            { platform: 'codeforces', platformUid: `${username}-sub`, platformUsername: 'Alice' }
        ]);
        assert.equal('cpStatsStatus' in fastBody, false);
        assert.equal('ratingHistoryStatus' in fastBody, false);
        assert.equal(JSON.stringify(fastBody).includes('enc:v1:'), false);
        const unavailable = await fetch(endpoint);
        const unavailableBody = await unavailable.json();
        assert.equal(unavailableBody.cpStatsStatus, 'unavailable');
        assert.equal(unavailableBody.ratingHistoryStatus, 'unavailable');
        assert.equal('cpStats' in unavailableBody, false);
        assert.equal('ratingHistory' in unavailableBody, false);
        assert.equal(requests.length, 0);
        assert.equal((await fetch(`${endpoint}?includeStats=1`)).status, 400);
        assert.equal((await fetch(`${endpoint}?includeStats=true&includeStats=false`)).status, 400);

        await prisma.linkedAccount.update({ where: { id: linkedId }, data: {
            oauthAccessToken: encryptSecret(token, `LinkedAccount:oauthAccessToken:${linkedId}`, key)
        } });
        provider = async input => ({ status: 200, error: null, body: JSON.stringify(
            input.url.includes('/statistics/') ? { objects: [
                statistic(1, 100), statistic(2, 200, { new_rating: 9999 })
            ] } : { id: 1, accounts: [
                account(100, 'codeforces.com', 'alice'),
                account(200, 'codeforces.com', 'bob', { rating: 9999, n_contests: 99 })
            ] }
        ) });
        const available = await fetch(`${endpoint}/stats`);
        const availableBody = await available.json();
        assert.equal(available.headers.get('cache-control'), 'no-store');
        assert.equal(availableBody.cpStatsStatus, 'available');
        assert.equal(availableBody.ratingHistoryStatus, 'available');
        assert.equal(availableBody.cpStats.total_contests, 25);
        assert.deepEqual(availableBody.cpStats.accounts.map(value => value.handle), ['alice']);
        assert.equal(availableBody.cpStats.highest_rating.rating, 1900);
        assert.deepEqual(availableBody.ratingHistory.map(value => value.contest_id), [1]);
        assert.equal(requests.filter(value => value.url.includes('/coder/me/')).length, 1);
        const svg = await fetch(`${endpoint}/card.svg`);
        const svgBody = await svg.text();
        assert.equal(svg.headers.get('cache-control'), 'no-store');
        assert.ok(svgBody.includes('canonical.example.test'));
        assert.ok(svgBody.includes('Alice'));
        assert.equal(svgBody.includes('Clist.by'), false);
        assert.equal(svgBody.includes(token), false);

        await prisma.user.update({ where: { id: user.id }, data: { publicLinkedPlatforms: [] } });
        const empty = await fetch(`${endpoint}/stats`);
        const emptyBody = await empty.json();
        assert.equal(emptyBody.cpStatsStatus, 'available');
        assert.deepEqual(emptyBody.cpStats.accounts, []);
        assert.equal(emptyBody.cpStats.total_contests, 0);
        assert.equal(emptyBody.ratingHistoryStatus, 'available');
        assert.deepEqual(emptyBody.ratingHistory, []);
        const privateSvg = await fetch(`${endpoint}/card.svg`);
        assert.equal(privateSvg.headers.get('cache-control'), 'no-store');
        assert.equal((await privateSvg.text()).includes('Alice'), false);
        assert.equal((await fetch(`${endpoint}?includeStats=false`).then(value => value.json()))
            .linkedAccounts.length, 0);
        await prisma.user.update({ where: { id: user.id }, data: {
            publicLinkedPlatforms: ['codeforces'], publicCpStats: false, publicRatingHistory: false
        } });
        const requestCount = requests.length;
        assert.deepEqual(await fetch(`${endpoint}/stats`).then(value => value.json()), {});
        assert.equal(requests.length, requestCount);
    } finally {
        if (userId) await prisma.user.deleteMany({ where: { id: userId } });
        const digest = hashToken(token);
        await redis.del(`clist:v2:coder-me:${digest}`, `clist:v2:accounts:${digest}`,
            `clist:v2:stats:${digest}:500`);
        await redis.quit().catch(() => redis.disconnect());
        await prisma.$disconnect();
        await new Promise(resolve => server.close(resolve));
        for (const [name, value] of Object.entries(globals)) globalThis[name] = value;
    }
});

const python = process.env.PYTHON_PATH;
test('Python Clist adapter shares a total deadline and rejects redirected hosts and oversized output',
    { skip: !python }, () => {
    const script = fileURLToPath(new URL('../server/utils/clist-fetch.py', import.meta.url));
    const fixture = `
import json, runpy, sys, time, types
scenario = sys.argv[1]
clock = [0.0]
time.monotonic = lambda: clock[0]
class Timeout(Exception): pass
class Response:
    status_code = 200
    encoding = 'utf-8'
    headers = {}
    def close(self): pass
    def iter_content(self, chunk_size):
        if scenario == 'large': yield b'x' * (2 * 1024 * 1024 + 1)
        else: yield '竞赛'.encode('utf-8')
class Session:
    def __init__(self, **kwargs): self.curl_options = {}
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def request(self, method, url, **kwargs):
        clock[0] += 11 if scenario == 'deadline' else 0
        response = Response()
        if scenario == 'redirect':
            response.status_code = 302
            response.headers = {'Location': 'https://attacker.example/'}
        return response
requests = types.SimpleNamespace(Session=Session, exceptions=types.SimpleNamespace(Timeout=Timeout))
sys.modules['curl_cffi'] = types.SimpleNamespace(requests=requests)
sys.modules['curl_cffi.const'] = types.SimpleNamespace(CurlOpt=types.SimpleNamespace(TIMEOUT_MS=155))
runpy.run_path(sys.argv[2], run_name='__main__')
`;
    const invoke = scenario => JSON.parse(execFileSync(python, ['-c', fixture, scenario, script], {
        input: JSON.stringify({ method: 'GET', url: 'https://clist.by/api/v4/json/coder/me/',
            sessionInit: scenario === 'deadline' ? 'https://clist.by/' : null }),
        encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024
    }));
    assert.deepEqual(invoke('redirect'), { status: 0, body: '', error: 'invalid_response' });
    assert.deepEqual(invoke('large'), { status: 0, body: '', error: 'invalid_response' });
    assert.deepEqual(invoke('deadline'), { status: 0, body: '', error: 'timeout' });
    assert.deepEqual(invoke('utf8'), { status: 200, body: '竞赛', error: null });
});
