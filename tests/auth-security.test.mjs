import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApp, createError, defineEventHandler, getRequestURL, readBody, setResponseStatus, toNodeListener } from 'h3';
import { createJiti } from 'jiti';
import { generate, generateSecret } from 'otplib';
import jwt from 'jsonwebtoken';

const enabled = !!process.env.DATABASE_URL && !!process.env.NUXT_REDIS_URL;
if (enabled) {
    const database = new URL(process.env.DATABASE_URL);
    const redis = new URL(process.env.NUXT_REDIS_URL);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
        !decodeURIComponent(database.pathname).endsWith('_test') ||
        !['localhost', '127.0.0.1', '[::1]'].includes(redis.hostname)) {
        throw new Error('Authentication security tests require loopback Redis and an isolated _test database');
    }
}

// These tests exercise real Redis Lua operations and PostgreSQL version barriers, not mocks.
test('opaque sessions, MFA and reauthentication enforce their live state boundaries', { skip: !enabled }, async t => {
    const runtime = {
        redisUrl: process.env.NUXT_REDIS_URL,
        jwtSecret: randomBytes(32).toString('hex'),
        dataEncryptionKey: randomBytes(32).toString('base64'),
        trustProxy: 'false', public: { siteOrigin: 'https://identity.example.test' }
    };
    const previousRuntime = globalThis.useRuntimeConfig;
    globalThis.useRuntimeConfig = () => runtime;
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-01T12:00:05Z') });
    const jiti = createJiti(import.meta.url, {
        alias: { '~': fileURLToPath(new URL('../', import.meta.url)) }, fsCache: false
    });
    const { default: prisma } = await jiti.import('../server/utils/prisma.ts');
    const { getRedis } = await jiti.import('../server/utils/redis.ts');
    const auth = await jiti.import('../server/utils/auth.ts');
    const completion = await jiti.import('../server/utils/auth-completion.ts');
    const security = await jiti.import('../server/utils/security.ts');
    const setup = await jiti.import('../server/utils/two-factor.ts');
    const { enforceRateLimit } = await jiti.import('../server/utils/rate-limit.ts');
    const { encryptSecret, decryptSecret } = await jiti.import('../server/utils/secrets.ts');
    const { hashToken } = await jiti.import('../server/utils/token-hash.ts');
    const { default: sessionMiddleware } = await jiti.import('../server/middleware/auth-session.ts');
    const { default: csrfMiddleware } = await jiti.import('../server/middleware/csrf.ts');
    const redis = getRedis();
    if (redis.status !== 'ready') {
        await new Promise((resolve, reject) => {
            redis.once('ready', resolve);
            redis.once('error', reject);
        });
    }
    const users = [];
    const keys = new Set();
    const encryptionKey = Buffer.from(runtime.dataEncryptionKey, 'base64');
    const app = createApp();
    app.use(sessionMiddleware);
    app.use(csrfMiddleware);
    app.use(defineEventHandler(async event => {
        const path = getRequestURL(event).pathname;
        if (path === '/api/me') return auth.getAuthContext(event);
        if (path === '/api/logout') {
            await auth.logoutAuthSession(event);
            setResponseStatus(event, 204);
            return null;
        }
        const body = await readBody(event);
        if (path === '/api/rate') {
            await enforceRateLimit(event, body.action, body.principal);
            setResponseStatus(event, 204);
            return null;
        }
        if (path === '/api/primary') {
            const user = await prisma.user.findUniqueOrThrow({ where: { id: body.userId } });
            return completion.completePrimaryAuthentication(event, user.id, {
                mode: 'login', redirect: '/profile?tab=security', authVersion: user.authVersion
            });
        }
        if (path === '/api/factor') return completion.completeTwoFactorAuthentication(event, body.challengeId, body.code);
        if (path === '/api/proof') {
            const context = auth.getAuthContext(event);
            return completion.completePrimaryAuthentication(event, context.userId, {
                mode: 'reauth', redirect: '/profile?tab=security', purpose: body.purpose,
                sessionId: context.sessionId, authVersion: context.authVersion
            });
        }
        if (path === '/api/consume-proof') return completion.requireFreshReauthentication(event, body.purpose, body.token);
        if (path === '/api/setup/totp') return setup.beginTwoFactorSetup(event, 'totp', body.token);
        if (path === '/api/setup/totp/confirm') return setup.confirmTwoFactorSetup(event, 'totp', body.code);
        if (path === '/api/setup/cancel') {
            await setup.cancelTwoFactorSetup(event);
            setResponseStatus(event, 204);
            return null;
        }
        throw createError({ statusCode: 404 });
    }));
    const server = createServer(toNodeListener(app));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;

    function browser() {
        const cookies = new Map();
        return {
            cookies,
            async request(path, body, headers = {}) {
                const response = await fetch(`${origin}${path}`, {
                    method: body === undefined ? 'GET' : 'POST',
                    headers: {
                        'Content-Type': 'application/json', 'X-CP-OAuth-CSRF': '1',
                        Origin: runtime.public.siteOrigin, 'Sec-Fetch-Site': 'same-origin',
                        Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), ...headers
                    },
                    body: body === undefined ? undefined : JSON.stringify(body)
                });
                const setCookies = response.headers.getSetCookie();
                for (const cookie of setCookies) {
                    const pair = cookie.split(';', 1)[0];
                    const split = pair.indexOf('=');
                    const name = pair.slice(0, split);
                    const value = pair.slice(split + 1);
                    if (!value || /Max-Age=0/.test(cookie)) cookies.delete(name);
                    else cookies.set(name, value);
                    if (name === 'cp_oauth_session' && value) keys.add(`cp-oauth:v2:auth:session:${hashToken(value)}`);
                }
                const text = await response.text();
                const data = text ? JSON.parse(text) : null;
                if (data?.challengeId) {
                    keys.add(security.build2faLoginChallengeKey(data.challengeId));
                    keys.add(`${security.build2faLoginChallengeKey(data.challengeId)}:attempts`);
                }
                if (data?.reauthToken) keys.add(`cp-oauth:v2:auth:reauth:${hashToken(data.reauthToken)}`);
                return { status: response.status, data, setCookies,
                    retryAfter: response.headers.get('retry-after') };
            }
        };
    }

    async function fixture(mfa = false) {
        const secret = generateSecret();
        const user = await prisma.user.create({
            data: {
                id: randomUUID(), username: `sec_${randomUUID().slice(0, 8)}`,
                email: `${randomUUID()}@example.test`, emailVerified: true,
                passwordHash: 'not-used-by-completion-tests', role: 'user'
            }
        });
        users.push(user.id);
        keys.add(`cp-oauth:v2:auth:user-sessions:${user.id}`);
        if (mfa) await prisma.user.update({ where: { id: user.id }, data: {
            twoFactorEnabled: true, twoFactorMethod: 'totp',
            totpSecret: encryptSecret(secret, `User:totpSecret:${user.id}`, encryptionKey)
        } });
        const code = await generate({ secret });
        keys.add(`cp-oauth:v2:auth:totp-used:${user.id}:${hashToken(code)}`);
        return { user, secret, code };
    }

    try {
        await t.test('cookie identity is opaque, logout is atomic and Bearer cannot identify a first-party request', async () => {
            const { user } = await fixture();
            const client = browser();
            const primary = await client.request('/api/primary', { userId: user.id });
            assert.equal(primary.status, 200);
            assert.deepEqual(primary.data, { authenticated: true, redirect: '/profile?tab=security' });
            const sessionCookie = primary.setCookies.find(cookie => cookie.startsWith('cp_oauth_session='));
            assert.match(sessionCookie, /HttpOnly/);
            assert.match(sessionCookie, /SameSite=Lax/);
            assert.match(sessionCookie, /Path=\//);
            const sid = client.cookies.get('cp_oauth_session');
            assert.match(sid, /^[A-Za-z0-9_-]{43}$/);
            assert.equal(await redis.exists(`cp-oauth:v2:auth:session:${sid}`), 0);
            const key = `cp-oauth:v2:auth:session:${hashToken(sid)}`;
            assert.deepEqual(JSON.parse(await redis.get(key)), { userId: user.id, authVersion: 0 });
            assert.equal((await client.request('/api/me')).data.userId, user.id);
            const legacyToken = jwt.sign({ userId: user.id, sid: hashToken(sid) }, runtime.jwtSecret);
            const legacy = browser();
            legacy.cookies.set('auth_token', legacyToken);
            assert.equal((await legacy.request('/api/me', undefined, { Authorization: `Bearer ${legacyToken}` })).status, 401);
            assert.equal(legacy.cookies.has('auth_token'), false);
            assert.equal((await client.request('/api/logout', {})).status, 204);
            assert.equal(await redis.exists(key), 0);
            client.cookies.set('cp_oauth_session', sid);
            assert.equal((await client.request('/api/me')).status, 401);
            assert.equal((await client.request('/api/logout', {})).status, 204);
        });

        await t.test('a live database version change invalidates both session and previously issued proof', async () => {
            const { user } = await fixture();
            const client = browser();
            await client.request('/api/primary', { userId: user.id });
            const proof = await client.request('/api/proof', { purpose: 'password_change' });
            assert.equal(proof.data.expiresIn, 300);
            await prisma.user.update({ where: { id: user.id }, data: { authVersion: { increment: 1 } } });
            assert.equal((await client.request('/api/consume-proof', { purpose: 'password_change', token: proof.data.reauthToken })).status, 401);
            assert.equal(client.cookies.has('cp_oauth_session'), false);
        });

        await t.test('proof is bound to purpose and browser sid, and exactly one concurrent consume succeeds', async () => {
            const { user } = await fixture();
            const first = browser();
            const second = browser();
            await first.request('/api/primary', { userId: user.id });
            await second.request('/api/primary', { userId: user.id });
            const proof = await first.request('/api/proof', { purpose: 'binding_change' });
            const token = proof.data.reauthToken;
            assert.equal((await first.request('/api/consume-proof', { purpose: 'email_change', token })).status, 403);
            assert.equal((await second.request('/api/consume-proof', { purpose: 'binding_change', token })).status, 403);
            const responses = await Promise.all(Array.from({ length: 8 }, () => first.request('/api/consume-proof', { purpose: 'binding_change', token })));
            assert.equal(responses.filter(response => response.status === 200).length, 1);
            assert.equal(responses.filter(response => response.status === 403).length, 7);
        });

        await t.test('expired proof and MFA challenge cannot be redeemed', async () => {
            const { user } = await fixture();
            const client = browser();
            await client.request('/api/primary', { userId: user.id });
            const proof = await client.request('/api/proof', { purpose: 'passkey_delete' });
            const proofKey = `cp-oauth:v2:auth:reauth:${hashToken(proof.data.reauthToken)}`;
            await redis.pexpire(proofKey, 0);
            assert.equal((await client.request('/api/consume-proof', { purpose: 'passkey_delete', token: proof.data.reauthToken })).status, 403);
            const factorUser = await fixture(true);
            const anonymous = browser();
            const challenge = await anonymous.request('/api/primary', { userId: factorUser.user.id });
            await redis.pexpire(security.build2faLoginChallengeKey(challenge.data.challengeId), 0);
            const denied = await anonymous.request('/api/factor', { challengeId: challenge.data.challengeId, code: factorUser.code });
            assert.equal(denied.status, 400);
            assert.equal(denied.data.data.code, 'AUTH_CHALLENGE_EXPIRED');
            assert.equal(anonymous.cookies.has('cp_oauth_session'), false);
        });

        await t.test('an email challenge is atomically consumed by exactly one valid concurrent request', async () => {
            const { user } = await fixture();
            await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, twoFactorMethod: 'email_otp' } });
            const client = browser();
            const flow = randomBytes(32).toString('base64url');
            client.cookies.set('cp_oauth_flow', flow);
            const challengeId = randomBytes(32).toString('base64url');
            const key = security.build2faLoginChallengeKey(challengeId);
            keys.add(key);
            keys.add(`${key}:attempts`);
            await security.setRedisJson(key, {
                userId: user.id, authVersion: 0, method: 'email_otp', redirect: '/profile',
                mode: 'login', flowHash: hashToken(flow), codeHash: await security.hashCode('123456')
            }, 600);
            const responses = await Promise.all(Array.from({ length: 4 }, () => client.request('/api/factor', { challengeId, code: '123456' })));
            assert.equal(responses.filter(response => response.status === 200).length, 1);
            assert.equal(responses.filter(response => response.status === 400).length, 3);
            assert.equal(await redis.scard(`cp-oauth:v2:auth:user-sessions:${user.id}`), 1);
        });

        await t.test('MFA creates no session until the factor succeeds and another browser cannot consume its challenge', async () => {
            const { user, code } = await fixture(true);
            const client = browser();
            const primary = await client.request('/api/primary', { userId: user.id });
            assert.equal(primary.data.requiresTwoFactor, true);
            assert.equal(client.cookies.has('cp_oauth_session'), false);
            const stolen = await browser().request('/api/factor', { challengeId: primary.data.challengeId, code });
            assert.equal(stolen.status, 400);
            assert.equal(stolen.data.data.code, 'AUTH_CHALLENGE_EXPIRED');
            const result = await client.request('/api/factor', { challengeId: primary.data.challengeId, code });
            assert.equal(result.status, 200);
            assert.equal(result.data.authenticated, true);
            const next = await client.request('/api/primary', { userId: user.id });
            const replay = await client.request('/api/factor', { challengeId: next.data.challengeId, code });
            assert.equal(replay.status, 401);
            assert.equal(replay.data.data.code, 'INVALID_MFA_CODE');
        });

        await t.test('five wrong factors exhaust the challenge without changing its CAS payload', async () => {
            const { user, code } = await fixture(true);
            const client = browser();
            const primary = await client.request('/api/primary', { userId: user.id });
            const key = security.build2faLoginChallengeKey(primary.data.challengeId);
            const raw = await redis.get(key);
            const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
            for (let attempt = 0; attempt < 5; attempt++) {
                assert.equal((await client.request('/api/factor', { challengeId: primary.data.challengeId, code: wrong })).status, 401);
            }
            assert.equal(await redis.get(key), raw);
            const blocked = await client.request('/api/factor', { challengeId: primary.data.challengeId, code });
            assert.equal(blocked.status, 429);
            assert.equal(blocked.data.data.code, 'AUTH_CHALLENGE_EXHAUSTED');
            assert.equal(await redis.exists(key), 0);
            assert.equal(client.cookies.has('cp_oauth_session'), false);
        });

        await t.test('method and version changes reject previously valid factors', async () => {
            const { user, code } = await fixture(true);
            const client = browser();
            const first = await client.request('/api/primary', { userId: user.id });
            await prisma.user.update({ where: { id: user.id }, data: { twoFactorMethod: 'email_otp' } });
            const obsoleteMethod = await client.request('/api/factor', { challengeId: first.data.challengeId, code });
            assert.equal(obsoleteMethod.status, 400);
            await prisma.user.update({ where: { id: user.id }, data: { twoFactorMethod: 'totp' } });
            const second = await client.request('/api/primary', { userId: user.id });
            await prisma.user.update({ where: { id: user.id }, data: { authVersion: { increment: 1 } } });
            const obsoleteVersion = await client.request('/api/factor', { challengeId: second.data.challengeId, code });
            assert.equal(obsoleteVersion.status, 400);
            assert.equal(client.cookies.has('cp_oauth_session'), false);
        });

        await t.test('TOTP setup exposes only QR, encrypts both seeds and rotates the current browser while invalidating other sessions', async () => {
            const { user } = await fixture();
            const current = browser();
            const other = browser();
            await current.request('/api/primary', { userId: user.id });
            await other.request('/api/primary', { userId: user.id });
            const oldSid = current.cookies.get('cp_oauth_session');
            const proof = await current.request('/api/proof', { purpose: 'mfa_change' });
            const started = await current.request('/api/setup/totp', { token: proof.data.reauthToken });
            assert.equal(started.status, 200);
            assert.deepEqual(Object.keys(started.data), ['qrCodeDataUrl']);
            assert.match(started.data.qrCodeDataUrl, /^data:image\/png;base64,/);
            const setupKey = security.build2faSetupTotpKey(user.id, hashToken(oldSid));
            keys.add(setupKey);
            keys.add(`${setupKey}:attempts`);
            const pending = JSON.parse(await redis.get(setupKey));
            assert.match(pending.secret, /^enc:v1:/);
            const seed = decryptSecret(pending.secret, `PendingTotp:${user.id}:${hashToken(oldSid)}`, encryptionKey);
            const confirmed = await current.request('/api/setup/totp/confirm', { code: await generate({ secret: seed }) });
            assert.equal(confirmed.status, 200);
            assert.notEqual(current.cookies.get('cp_oauth_session'), oldSid);
            const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
            assert.equal(stored.authVersion, 1);
            assert.equal(decryptSecret(stored.totpSecret, `User:totpSecret:${user.id}`, encryptionKey), seed);
            assert.equal((await other.request('/api/me')).status, 401);
            assert.equal((await current.request('/api/me')).data.authVersion, 1);
        });

        await t.test('a cross-site mutation cannot create an authenticated session', async () => {
            const { user } = await fixture();
            const client = browser();
            const denied = await client.request('/api/primary', { userId: user.id }, { Origin: 'https://attacker.example' });
            assert.equal(denied.status, 403);
            assert.equal(client.cookies.has('cp_oauth_session'), false);
            assert.equal(await redis.scard(`cp-oauth:v2:auth:user-sessions:${user.id}`), 0);
        });

        await t.test('parallel principal limits are atomic and spoofed forwarding headers cannot reset socket IP limits', async () => {
            const { user } = await fixture();
            const client = browser();
            const responses = await Promise.all(Array.from({ length: 20 }, (_, index) =>
                client.request('/api/rate', { action: 'login', principal: user.id },
                    { 'X-Forwarded-For': `198.51.100.${index + 1}` })
            ));
            assert.equal(responses.filter(response => response.status === 204).length, 10);
            const limited = responses.filter(response => response.status === 429);
            assert.equal(limited.length, 10);
            assert.equal(limited.every(response => Number(response.retryAfter) > 0), true);
            for (let index = 0; index < 10; index++) {
                assert.equal((await client.request('/api/rate', { action: 'register' },
                    { 'X-Forwarded-For': `203.0.113.${index + 1}` })).status, 204);
            }
            const ipLimit = await client.request('/api/rate', { action: 'register' },
                { 'X-Forwarded-For': '203.0.113.99' });
            assert.equal(ipLimit.status, 429);
            assert.equal(ipLimit.data.data.code, 'RATE_LIMITED');
        });
    } finally {
        await new Promise(resolve => server.close(resolve));
        await prisma.user.deleteMany({ where: { id: { in: users } } });
        for (const action of ['login', 'register', 'challenge', 'mfa']) {
            for (const ip of ['127.0.0.1', '::ffff:127.0.0.1']) {
                keys.add(`cp-oauth:v2:rate:${action}:${createHmac('sha256', runtime.jwtSecret).update(`ip:${ip}`).digest('hex')}`);
            }
            for (const id of users) keys.add(`cp-oauth:v2:rate:${action}:${createHmac('sha256', runtime.jwtSecret).update(`principal:${id}`).digest('hex')}`);
        }
        if (keys.size) await redis.del(...keys);
        redis.disconnect();
        await prisma.$disconnect();
        globalThis.useRuntimeConfig = previousRuntime;
        t.mock.timers.reset();
    }
});
