import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createJiti } from 'jiti';

const base = new URL(process.env.TEST_BASE_URL || '');
const database = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || !database.pathname.endsWith('_test')) {
    throw new Error('OAuth integration requires an explicit loopback server and _test database');
}
if (!process.env.NUXT_JWT_SECRET || !process.env.NUXT_REDIS_URL) {
    throw new Error('OAuth integration requires explicit test signing and Redis configuration');
}
const prisma = new PrismaClient();
const redis = new Redis(process.env.NUXT_REDIS_URL, { enableOfflineQueue: false });
const prefix = `oauth_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const password = 'OAuth-integration-password-1';
const redirectUri = 'https://consumer.example/oauth/callback?existing=1';
const userIds = [];
let user;
let otherUser;
let session;
let client;
let otherClient;
const hash = value => createHash('sha256').update(value).digest('hex');

async function http(path, { method = 'GET', body, form = false, headers = {} } = {}) {
    const response = await fetch(new URL(path, base), {
        method,
        headers: {
            ...(body === undefined ? {} : { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }),
            ...headers
        },
        body: body === undefined ? undefined : form ? new URLSearchParams(body).toString() : JSON.stringify(body),
        redirect: 'manual'
    });
    const text = await response.text();
    return { response, data: text ? JSON.parse(text) : null };
}
function firstPartyHeaders(cookie = session) {
    return { Origin: base.origin, 'X-CP-OAuth-CSRF': '1', ...(cookie ? { Cookie: cookie } : {}) };
}
async function token(body, form = false) {
    return http('/api/oauth/token', { method: 'POST', body, form, headers: { Origin: 'https://consumer.example' } });
}
function assertOAuthError(result, error, status = 400) {
    assert.equal(result.response.status, status);
    assert.equal(result.data.error, error);
    assert.equal(typeof result.data.error_description, 'string');
    assert.equal(result.response.headers.get('cache-control'), 'no-store');
    assert.equal(result.response.headers.get('pragma'), 'no-cache');
    assert.equal(Object.hasOwn(result.data, 'statusCode'), false);
}
async function createClient(name = `${prefix} application`) {
    const result = await http('/api/oauth/clients', {
        method: 'POST', headers: firstPartyHeaders(),
        body: { name, redirectUris: [redirectUri], requireEmailVerified: true }
    });
    assert.equal(result.response.status, 200);
    return result.data;
}
async function authorize({ target = client, scopes = ['openid', 'profile', 'email'], challenge, method, state = 'integration-state' } = {}) {
    const parameters = {
        response_type: 'code', client_id: target.clientId, redirect_uri: redirectUri,
        scope: scopes.join(' '), state,
        ...(challenge === undefined ? {} : { code_challenge: challenge }),
        ...(method === undefined ? {} : { code_challenge_method: method })
    };
    const info = await http(`/api/oauth/authorize?${new URLSearchParams(parameters)}`);
    assert.equal(info.response.status, 200);
    const result = await http('/api/oauth/authorize', {
        method: 'POST', headers: firstPartyHeaders(),
        body: {
            client_id: target.clientId, redirect_uri: redirectUri, scopes, state, approved: true,
            ...(challenge === undefined ? {} : { code_challenge: challenge }),
            ...(method === undefined ? {} : { code_challenge_method: method })
        }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get('cache-control'), 'no-store');
    const callback = new URL(result.data.redirect);
    assert.equal(callback.searchParams.get('state'), state);
    assert.equal(callback.searchParams.get('existing'), '1');
    const code = callback.searchParams.get('code');
    if (!code) throw new Error('Consent did not return an authorization code');
    return code;
}
async function publicGrant({ target = client, scopes, method = 'S256' } = {}) {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = method === 'S256' ? createHash('sha256').update(verifier).digest('base64url') : verifier;
    const code = await authorize({ target, scopes, challenge, ...(method === 'plain' ? {} : { method }) });
    return { code, verifier, target, body: {
        grant_type: 'authorization_code', client_id: target.clientId, redirect_uri: redirectUri,
        code, code_verifier: verifier
    } };
}

before(async () => {
    if (redis.status !== 'ready') await once(redis, 'ready');
    const passwordHash = await bcrypt.hash(password, 10);
    user = await prisma.user.create({ data: {
        username: prefix, email: `${prefix}@example.test`, passwordHash, emailVerified: true
    } });
    userIds.push(user.id);
    otherUser = await prisma.user.create({ data: {
        username: `${prefix}b`, email: `${prefix}b@example.test`, passwordHash, emailVerified: false
    } });
    userIds.push(otherUser.id);
    const login = await http('/api/auth/login', {
        method: 'POST', body: { email: user.email, password }, headers: firstPartyHeaders(null)
    });
    assert.equal(login.response.status, 200);
    const setCookie = login.response.headers.getSetCookie().find(value => value.startsWith('cp_oauth_session='));
    if (!setCookie) throw new Error('The test login did not create a session');
    session = setCookie.split(';', 1)[0];
    client = await createClient();
    otherClient = await createClient(`${prefix} other application`);
});
after(async () => {
    for (const id of userIds) {
        const key = `cp-oauth:v2:auth:user-sessions:${id}`;
        const sessions = await redis.smembers(key);
        await redis.del(key, ...sessions.map(sid => `cp-oauth:v2:auth:session:${sid}`));
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    await redis.quit();
});

test('anonymous denial preserves state and does not create a code', async () => {
    const beforeCount = await prisma.oAuthAuthorizationCode.count({ where: { userId: user.id } });
    const state = 'caller state &?/中文';
    const result = await http('/api/oauth/authorize', {
        method: 'POST', headers: firstPartyHeaders(null),
        body: { client_id: client.clientId, redirect_uri: redirectUri, scopes: ['profile'], approved: false, state }
    });
    assert.equal(result.response.status, 200);
    const callback = new URL(result.data.redirect);
    assert.equal(callback.searchParams.get('error'), 'access_denied');
    assert.equal(callback.searchParams.get('state'), state);
    assert.equal(callback.searchParams.has('code'), false);
    assert.equal(await prisma.oAuthAuthorizationCode.count({ where: { userId: user.id } }), beforeCount);
});

test('authorization rejects unsafe registered redirects and exact-match violations without redirecting', async () => {
    const unsafe = await prisma.oAuthClient.create({ data: {
        name: `${prefix} legacy insecure redirect`, userId: user.id,
        clientSecretHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
        redirectUris: ['http://consumer.example/callback']
    } });
    for (const [target, uri] of [
        [unsafe.clientId, unsafe.redirectUris[0]], [client.clientId, `${redirectUri}&extra=1`]
    ]) {
        const query = new URLSearchParams({ response_type: 'code', client_id: target, redirect_uri: uri, scope: 'profile' });
        assertOAuthError(await http(`/api/oauth/authorize?${query}`), 'invalid_request');
        const denial = await http('/api/oauth/authorize', {
            method: 'POST', headers: firstPartyHeaders(null),
            body: { client_id: target, redirect_uri: uri, scopes: ['profile'], approved: false }
        });
        assertOAuthError(denial, 'invalid_request');
        assert.equal(Object.hasOwn(denial.data, 'redirect'), false);
    }
});

test('authorization parser rejects prototype scopes, duplicate queries and invalid PKCE', async () => {
    const query = { response_type: 'code', client_id: client.clientId, redirect_uri: redirectUri, scope: 'profile' };
    for (const scope of ['', 'toString', '__proto__', 'constructor']) {
        assertOAuthError(await http(`/api/oauth/authorize?${new URLSearchParams({ ...query, scope })}`), 'invalid_scope');
    }
    assertOAuthError(await http(`/api/oauth/authorize?${new URLSearchParams(query)}&scope=email`), 'invalid_request');
    for (const patch of [
        { code_challenge_method: 'S256' },
        { code_challenge: 'a'.repeat(43), code_challenge_method: 'other' },
        { code_challenge: 'a'.repeat(42), code_challenge_method: 'S256' }
    ]) {
        assertOAuthError(await http(`/api/oauth/authorize?${new URLSearchParams({ ...query, ...patch })}`), 'invalid_request');
    }
    const denial = { client_id: client.clientId, redirect_uri: redirectUri, scopes: ['profile'], approved: false };
    for (const patch of [{ approved: 'false' }, { client_id: [client.clientId] }, { scopes: 'profile' }]) {
        assertOAuthError(await http('/api/oauth/authorize', {
            method: 'POST', body: { ...denial, ...patch }, headers: firstPartyHeaders(null)
        }), 'invalid_request');
    }
});

test('secret-only grants reject missing or wrong authentication without consuming credentials', async () => {
    const code = await authorize();
    const body = { grant_type: 'authorization_code', client_id: client.clientId, redirect_uri: redirectUri, code };
    for (const patch of [{}, { client_secret: '' }, { client_secret: 'wrong-secret' }]) {
        assertOAuthError(await token({ ...body, ...patch }), 'invalid_client', 401);
        assert.equal((await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hash(code) } })).used, false);
    }
    const issued = await token({ ...body, client_secret: client.clientSecret });
    assert.equal(issued.response.status, 200);
    assert.equal(issued.response.headers.get('cache-control'), 'no-store');
    const access = await prisma.oAuthAccessToken.findUnique({ where: { tokenHash: hash(issued.data.access_token) } });
    const refresh = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(issued.data.refresh_token) } });
    assert.equal(access.clientAuthRequired, true);
    assert.equal(refresh.clientAuthRequired, true);
    const refreshBody = { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: issued.data.refresh_token };
    assertOAuthError(await token(refreshBody), 'invalid_client', 401);
    assertOAuthError(await token({ ...refreshBody, client_secret: client.clientSecret, scope: 'openid profile email cp:linked' }), 'invalid_scope');
    assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { id: refresh.id } })).revoked, false);
    const rotated = await token({ ...refreshBody, client_secret: client.clientSecret, scope: 'profile' }, true);
    assert.equal(rotated.response.status, 200);
    assert.equal(rotated.data.scope, 'profile');
    assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(rotated.data.refresh_token) } })).clientAuthRequired, true);
});

for (const method of ['S256', 'plain']) {
    test(`${method} public grants support form exchange, JSON refresh and secretless revocation`, async () => {
        const grant = await publicGrant({ method });
        for (const secret of ['', 'wrong-secret']) {
            assertOAuthError(await token({ ...grant.body, client_secret: secret }), 'invalid_client', 401);
        }
        assertOAuthError(await token({ ...grant.body, code_verifier: 'x'.repeat(43) }), 'invalid_grant');
        assert.equal((await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hash(grant.code) } })).used, false);
        const issued = await token(grant.body, true);
        assert.equal(issued.response.status, 200);
        assert.equal((await prisma.oAuthAccessToken.findUnique({ where: { tokenHash: hash(issued.data.access_token) } })).clientAuthRequired, false);
        assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(issued.data.refresh_token) } })).clientAuthRequired, false);
        const refreshBody = { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: issued.data.refresh_token };
        assertOAuthError(await token({ ...refreshBody, scope: 'cp:linked' }), 'invalid_scope');
        assertOAuthError(await token({ ...refreshBody, client_secret: '' }), 'invalid_client', 401);
        assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(issued.data.refresh_token) } })).revoked, false);
        const rotated = await token({ ...refreshBody, scope: 'profile' });
        assert.equal(rotated.response.status, 200);
        assert.equal(rotated.data.scope, 'profile');
        const info = await http('/api/oauth/userinfo', { headers: { Authorization: `Bearer ${rotated.data.access_token}` } });
        assert.equal(info.response.status, 200);
        assert.equal(info.data.username, user.username);
        assert.equal(Object.hasOwn(info.data, 'sub'), false);
        assert.equal(Object.hasOwn(info.data, 'email'), false);
        const revokeAccess = await http('/api/oauth/revoke', {
            method: 'POST', body: { client_id: client.clientId, token: rotated.data.access_token, token_type_hint: 'refresh_token' }
        });
        assert.equal(revokeAccess.response.status, 200);
        assert.equal(await prisma.oAuthAccessToken.count({ where: { tokenHash: hash(rotated.data.access_token) } }), 0);
        assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(rotated.data.refresh_token) } })).revoked, false);
        const revokeRefresh = await http('/api/oauth/revoke', {
            method: 'POST', form: true, body: { client_id: client.clientId, token: rotated.data.refresh_token, token_type_hint: 'access_token' }
        });
        assert.equal(revokeRefresh.response.status, 200);
        assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(rotated.data.refresh_token) } })).revoked, true);
        assert.equal(await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } }), 0);
    });
}

test('a PKCE exchange with a supplied valid secret creates a secret-required grant', async () => {
    const grant = await publicGrant();
    const issued = await token({ ...grant.body, client_secret: client.clientSecret });
    assert.equal(issued.response.status, 200);
    assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(issued.data.refresh_token) } })).clientAuthRequired, true);
    const refreshBody = { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: issued.data.refresh_token };
    assertOAuthError(await token(refreshBody), 'invalid_client', 401);
    assert.equal((await token({ ...refreshBody, client_secret: client.clientSecret })).response.status, 200);
});

test('legacy refresh tokens remain secret-required and rotations inherit that requirement', async () => {
    const value = randomBytes(64).toString('hex');
    const legacy = await prisma.oAuthRefreshToken.create({ data: {
        tokenHash: hash(value), userId: user.id, clientId: client.clientId,
        scopes: ['profile'], expiresAt: new Date(Date.now() + 60000)
    } });
    assert.equal(legacy.clientAuthRequired, true);
    const body = { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: value };
    assertOAuthError(await token(body), 'invalid_client', 401);
    const rotated = await token({ ...body, client_secret: client.clientSecret });
    assert.equal(rotated.response.status, 200);
    assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(rotated.data.refresh_token) } })).clientAuthRequired, true);
});

test('revocation cannot revoke another client and hint fallback deletes only the intended grant', async () => {
    const a = await token((await publicGrant()).body);
    const b = await token((await publicGrant({ target: otherClient })).body);
    assert.equal(a.response.status, 200);
    assert.equal(b.response.status, 200);
    const foreign = await http('/api/oauth/revoke', {
        method: 'POST', body: { client_id: otherClient.clientId, client_secret: otherClient.clientSecret, token: a.data.refresh_token }
    });
    assert.equal(foreign.response.status, 200);
    assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(a.data.refresh_token) } })).revoked, false);
    assert.equal(await prisma.oAuthAccessToken.count({ where: { tokenHash: hash(a.data.access_token) } }), 1);
    const own = await http('/api/oauth/revoke', {
        method: 'POST', body: { client_id: client.clientId, token: a.data.refresh_token, token_type_hint: 'access_token' }
    });
    assert.equal(own.response.status, 200);
    assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(a.data.refresh_token) } })).revoked, true);
    assert.equal(await prisma.oAuthAccessToken.count({ where: { tokenHash: hash(b.data.access_token) } }), 1);
    const unknown = { client_id: client.clientId, token: randomBytes(32).toString('hex') };
    assert.equal((await http('/api/oauth/revoke', { method: 'POST', body: unknown })).response.status, 200);
    assertOAuthError(await http('/api/oauth/revoke', { method: 'POST', body: { ...unknown, client_secret: '' } }), 'invalid_client', 401);
});

test('userinfo accepts old HS256 JWTs without jti but uses stored scopes and user/client binding', async () => {
    const value = jwt.sign({ sub: user.id, client_id: client.clientId, scopes: ['openid', 'profile', 'email'], type: 'oauth_access' },
        process.env.NUXT_JWT_SECRET, { algorithm: 'HS256', expiresIn: 3600 });
    const row = await prisma.oAuthAccessToken.create({ data: {
        tokenHash: hash(value), userId: user.id, clientId: client.clientId,
        scopes: ['profile'], expiresAt: new Date(Date.now() + 60000)
    } });
    const headers = { Authorization: `Bearer ${value}` };
    const info = await http('/api/oauth/userinfo', { headers });
    assert.equal(info.response.status, 200);
    assert.equal(info.data.username, user.username);
    assert.equal(Object.hasOwn(info.data, 'sub'), false);
    assert.equal(Object.hasOwn(info.data, 'email'), false);
    for (const patch of [{ clientId: otherClient.clientId }, { userId: otherUser.id, clientId: client.clientId }]) {
        await prisma.oAuthAccessToken.update({ where: { id: row.id }, data: patch });
        const rejected = await http('/api/oauth/userinfo', { headers });
        assertOAuthError(rejected, 'invalid_token', 401);
        assert.equal(rejected.response.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
    }
    await prisma.oAuthAccessToken.update({ where: { id: row.id }, data: { userId: user.id, clientId: client.clientId } });
    for (const [algorithm, type] of [['HS512', 'oauth_access'], ['HS256', 'auth']]) {
        const invalid = jwt.sign({ sub: user.id, client_id: client.clientId, scopes: ['profile'], type },
            process.env.NUXT_JWT_SECRET, { algorithm, expiresIn: 3600 });
        await prisma.oAuthAccessToken.create({ data: {
            tokenHash: hash(invalid), userId: user.id, clientId: client.clientId,
            scopes: ['profile'], expiresAt: new Date(Date.now() + 60000)
        } });
        assertOAuthError(await http('/api/oauth/userinfo', { headers: { Authorization: `Bearer ${invalid}` } }), 'invalid_token', 401);
    }
});

test('twenty simultaneous exchanges consume one code and one refresh exactly once', async () => {
    const grant = await publicGrant();
    const beforeAccess = await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } });
    const beforeRefresh = await prisma.oAuthRefreshToken.count({ where: { userId: user.id, clientId: client.clientId } });
    const exchanges = await Promise.all(Array.from({ length: 20 }, () => token(grant.body)));
    const successes = exchanges.filter(result => result.response.status === 200);
    assert.equal(successes.length, 1);
    for (const result of exchanges.filter(result => result !== successes[0])) assertOAuthError(result, 'invalid_grant');
    assert.equal(await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } }), beforeAccess + 1);
    assert.equal(await prisma.oAuthRefreshToken.count({ where: { userId: user.id, clientId: client.clientId } }), beforeRefresh + 1);
    const refreshToken = successes[0].data.refresh_token;
    const rotations = await Promise.all(Array.from({ length: 20 }, () => token({
        grant_type: 'refresh_token', client_id: client.clientId, refresh_token: refreshToken
    })));
    const rotated = rotations.filter(result => result.response.status === 200);
    assert.equal(rotated.length, 1);
    for (const result of rotations.filter(result => result !== rotated[0])) assertOAuthError(result, 'invalid_grant');
    assert.equal(await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } }), beforeAccess + 2);
    assert.equal(await prisma.oAuthRefreshToken.count({ where: { userId: user.id, clientId: client.clientId } }), beforeRefresh + 2);
    assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(refreshToken) } })).revoked, true);
});

test('different codes issued in the same second yield distinct JWTs with random grant identifiers', async () => {
    const grants = [];
    for (let index = 0; index < 20; index++) grants.push(await publicGrant({ scopes: ['profile'] }));
    await delay(1000 - Date.now() % 1000 + 50);
    const exchanges = await Promise.all(grants.map(grant => token(grant.body)));
    for (const result of exchanges) assert.equal(result.response.status, 200);
    assert.equal(new Set(exchanges.map(result => result.data.access_token)).size, 20);
    const claims = exchanges.map(result => jwt.decode(result.data.access_token));
    assert.equal(new Set(claims.map(payload => payload.jti)).size, 20);
    const perSecond = new Map();
    for (const payload of claims) perSecond.set(payload.iat, (perSecond.get(payload.iat) || 0) + 1);
    assert.equal([...perSecond.values()].some(count => count >= 2), true, 'The fixture must exercise at least two same-second exchanges');
});

async function withRefreshInsertFailure(operation) {
    const name = `${prefix}_refresh_insert_failure`;
    await prisma.$executeRawUnsafe(`
        CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.user_id = '${user.id}' AND NEW.client_id = '${client.clientId}' THEN
                RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Isolated OAuth rollback fixture';
            END IF;
            RETURN NEW;
        END;
        $$
    `);
    try {
        await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON oauth_refresh_tokens FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
        return await operation();
    } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${name}" ON oauth_refresh_tokens`);
        await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${name}"()`);
    }
}

test('a database failure after code consumption rolls the entire grant back', async () => {
    const grant = await publicGrant();
    const beforeAccess = await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } });
    const beforeRefresh = await prisma.oAuthRefreshToken.count({ where: { userId: user.id, clientId: client.clientId } });
    await withRefreshInsertFailure(async () => {
        assertOAuthError(await token(grant.body), 'invalid_grant');
        assert.equal((await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hash(grant.code) } })).used, false);
        assert.equal(await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } }), beforeAccess);
        assert.equal(await prisma.oAuthRefreshToken.count({ where: { userId: user.id, clientId: client.clientId } }), beforeRefresh);
    });
    assert.equal((await token(grant.body)).response.status, 200);
});

test('a database failure after refresh consumption does not revoke the original credential', async () => {
    const issued = await token((await publicGrant()).body);
    assert.equal(issued.response.status, 200);
    const body = { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: issued.data.refresh_token };
    const beforeAccess = await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } });
    await withRefreshInsertFailure(async () => {
        assertOAuthError(await token(body), 'invalid_grant');
        assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(issued.data.refresh_token) } })).revoked, false);
        assert.equal(await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } }), beforeAccess);
    });
    assert.equal((await token(body)).response.status, 200);
});

async function expireWhileUpdateIsBlocked(kind, value, request) {
    const table = kind === 'code' ? 'oauth_authorization_codes' : 'oauth_refresh_tokens';
    const column = kind === 'code' ? 'code_hash' : 'token_hash';
    let acquired;
    let release;
    const locked = new Promise(resolve => { acquired = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const blocker = prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe(`SELECT id FROM ${table} WHERE ${column} = $1 FOR UPDATE`, hash(value));
        acquired();
        await gate;
        if (kind === 'code') {
            await tx.oAuthAuthorizationCode.updateMany({ where: { codeHash: hash(value) }, data: { expiresAt: new Date(Date.now() - 1000) } });
        } else {
            await tx.oAuthRefreshToken.updateMany({ where: { tokenHash: hash(value) }, data: { expiresAt: new Date(Date.now() - 1000) } });
        }
    }, { timeout: 15000 });
    await Promise.race([locked, blocker]);
    const pending = request();
    let observedBlockedUpdate = false;
    try {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const waiting = await prisma.$queryRaw`
                SELECT pid FROM pg_stat_activity
                WHERE datname = current_database() AND usename = current_user
                    AND wait_event_type = 'Lock' AND LOWER(query) LIKE ${'%update%' + table + '%'}
            `;
            if (waiting.length) { observedBlockedUpdate = true; break; }
            await delay(25);
        }
    } finally {
        release();
        await blocker;
    }
    const result = await pending;
    assert.equal(observedBlockedUpdate, true, 'The fixture must reach the real conditional UPDATE before expiring the row');
    return result;
}

test('expiry changed while the conditional code UPDATE waits cannot issue a token', async () => {
    const grant = await publicGrant();
    const beforeAccess = await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } });
    assertOAuthError(await expireWhileUpdateIsBlocked('code', grant.code, () => token(grant.body)), 'invalid_grant');
    assert.equal((await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hash(grant.code) } })).used, false);
    assert.equal(await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } }), beforeAccess);
});

test('expiry changed while the conditional refresh UPDATE waits cannot rotate a token', async () => {
    const issued = await token((await publicGrant()).body);
    assert.equal(issued.response.status, 200);
    const beforeAccess = await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } });
    const body = { grant_type: 'refresh_token', client_id: client.clientId, refresh_token: issued.data.refresh_token };
    assertOAuthError(await expireWhileUpdateIsBlocked('refresh', issued.data.refresh_token, () => token(body)), 'invalid_grant');
    assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash(issued.data.refresh_token) } })).revoked, false);
    assert.equal(await prisma.oAuthAccessToken.count({ where: { userId: user.id, clientId: client.clientId } }), beforeAccess);
});

test('authorized apps aggregate only active grants, include pending codes and revoke old pending consent', async () => {
    const target = await createClient(`${prefix} aggregated grants`);
    const hidden = await createClient(`${prefix} inactive grants`);
    const now = Date.now();
    const future = new Date(now + 600000);
    const past = new Date(now - 1000);
    const accessValue = randomBytes(32).toString('hex');
    const refreshValue = randomBytes(32).toString('hex');
    const codeValue = randomBytes(32).toString('hex');
    const latest = new Date(now - 1000);
    await prisma.oAuthAccessToken.createMany({ data: [
        { tokenHash: hash(accessValue), userId: user.id, clientId: target.clientId, scopes: ['profile'], expiresAt: future, createdAt: new Date(now - 3000) },
        { tokenHash: hash(randomUUID()), userId: user.id, clientId: target.clientId, scopes: ['email'], expiresAt: past, createdAt: new Date(now + 1000) },
        { tokenHash: hash(randomUUID()), userId: user.id, clientId: hidden.clientId, scopes: ['email'], expiresAt: past }
    ] });
    await prisma.oAuthRefreshToken.createMany({ data: [
        { tokenHash: hash(refreshValue), userId: user.id, clientId: target.clientId, scopes: ['profile', 'openid'], expiresAt: future, createdAt: new Date(now - 2000) },
        { tokenHash: hash(randomUUID()), userId: user.id, clientId: target.clientId, scopes: ['email'], revoked: true, expiresAt: future, createdAt: new Date(now + 1000) },
        { tokenHash: hash(randomUUID()), userId: user.id, clientId: target.clientId, scopes: ['cp:linked'], expiresAt: past, createdAt: new Date(now + 1000) }
    ] });
    await prisma.oAuthAuthorizationCode.createMany({ data: [
        { codeHash: hash(codeValue), userId: user.id, clientId: target.clientId, scopes: ['link:luogu'], redirectUri, expiresAt: future, createdAt: latest },
        { codeHash: hash(randomUUID()), userId: user.id, clientId: target.clientId, scopes: ['link:clist'], redirectUri, used: true, expiresAt: future, createdAt: new Date(now + 1000) }
    ] });
    const list = await http('/api/oauth/authorized-apps', { headers: firstPartyHeaders() });
    assert.equal(list.response.status, 200);
    const app = list.data.find(item => item.clientId === target.clientId);
    assert.deepEqual(app, {
        clientId: target.clientId, name: target.name, scopes: ['link:luogu', 'openid', 'profile'],
        latestAuthorizedAt: latest.toISOString(), accessTokenCount: 1, refreshTokenCount: 1,
        pendingAuthorizationCodeCount: 1
    });
    assert.equal(list.data.some(item => item.clientId === hidden.clientId), false);
    const deleted = await http(`/api/oauth/authorized-apps/${target.clientId}`, { method: 'DELETE', headers: firstPartyHeaders() });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.data.deletedAccessTokens, 2);
    assert.equal(deleted.data.revokedRefreshTokens, 3);
    assert.equal(deleted.data.deletedAuthorizationCodes, 1);
    assert.equal(await prisma.oAuthAuthorizationCode.count({ where: { userId: user.id, clientId: target.clientId, used: false } }), 0);
    assertOAuthError(await token({ grant_type: 'authorization_code', client_id: target.clientId, client_secret: target.clientSecret, redirect_uri: redirectUri, code: codeValue }), 'invalid_grant');
    assertOAuthError(await token({ grant_type: 'refresh_token', client_id: target.clientId, client_secret: target.clientSecret, refresh_token: refreshValue }), 'invalid_grant');
    const afterList = await http('/api/oauth/authorized-apps', { headers: firstPartyHeaders() });
    assert.equal(afterList.data.some(item => item.clientId === target.clientId), false);
});

test('client CRUD validates entire writes, retains unchanged legacy names and hides all existing secrets', async () => {
    const beforeCount = await prisma.oAuthClient.count({ where: { userId: user.id } });
    const draft = { name: 'Application', redirectUris: [redirectUri], requireEmailVerified: false };
    for (const patch of [
        { name: 'a'.repeat(101) }, { redirectUris: [] }, { redirectUris: Array(21).fill(redirectUri) },
        { redirectUris: ['http://consumer.example/callback'] }, { requireEmailVerified: 'false' }, { role: 'admin' }
    ]) {
        const rejected = await http('/api/oauth/clients', { method: 'POST', body: { ...draft, ...patch }, headers: firstPartyHeaders() });
        assert.equal(rejected.response.status, 400);
        assert.equal(rejected.data.data.code, 'VALIDATION_ERROR');
    }
    assert.equal(await prisma.oAuthClient.count({ where: { userId: user.id } }), beforeCount);
    const rejectedEdit = await http(`/api/oauth/clients/${client.id}`, {
        method: 'PATCH', body: { name: 'must not persist', requireEmailVerified: 'true' }, headers: firstPartyHeaders()
    });
    assert.equal(rejectedEdit.response.status, 400);
    assert.equal((await prisma.oAuthClient.findUnique({ where: { id: client.id } })).name, client.name);
    const legacy = await prisma.oAuthClient.create({ data: {
        userId: user.id, name: 'x'.repeat(120), redirectUris: [redirectUri],
        clientSecretHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10)
    } });
    const edited = await http(`/api/oauth/clients/${legacy.id}`, { method: 'PATCH', body: { requireEmailVerified: true }, headers: firstPartyHeaders() });
    assert.equal(edited.response.status, 200);
    assert.equal(edited.data.name, legacy.name);
    assert.equal(edited.data.requireEmailVerified, true);
    const foreign = await prisma.oAuthClient.create({ data: {
        userId: otherUser.id, name: 'Foreign application', redirectUris: [redirectUri],
        clientSecretHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10)
    } });
    for (const id of [foreign.id, randomUUID()]) {
        assert.equal((await http(`/api/oauth/clients/${id}`, { method: 'PATCH', body: { name: 'Unauthorized' }, headers: firstPartyHeaders() })).response.status, 404);
        assert.equal((await http(`/api/oauth/clients/${id}`, { method: 'DELETE', headers: firstPartyHeaders() })).response.status, 404);
    }
    assert.equal((await prisma.oAuthClient.findUnique({ where: { id: foreign.id } })).name, 'Foreign application');
    const list = await http('/api/oauth/clients', { headers: firstPartyHeaders() });
    assert.equal(list.response.status, 200);
    assert.equal(JSON.stringify(list.data).includes(client.clientSecret), false);
    for (const item of list.data) {
        assert.equal(Object.hasOwn(item, 'clientSecret'), false);
        assert.equal(Object.hasOwn(item, 'clientSecretHash'), false);
    }
    const removed = await http(`/api/oauth/clients/${legacy.id}`, { method: 'DELETE', headers: firstPartyHeaders() });
    assert.equal(removed.response.status, 200);
    assert.equal(await prisma.oAuthClient.count({ where: { id: legacy.id } }), 0);
});

test('JSON and form parameters are scalar, duplicate form parameters and malformed bodies return OAuth errors', async () => {
    for (const body of [
        { grant_type: ['authorization_code'] }, { grant_type: 'authorization_code', client_id: [client.clientId] },
        { grant_type: 'authorization_code', client_id: client.clientId, code: true },
        { grant_type: 'authorization_code', extension: {} }
    ]) assertOAuthError(await token(body), 'invalid_request');
    assertOAuthError(await token({ grant_type: 'client_credentials', client_id: client.clientId }), 'unsupported_grant_type');
    for (const [mediaType, body] of [
        ['application/json', '{'], ['text/plain', '{}'],
        ['application/x-www-form-urlencoded', `grant_type=refresh_token&client_id=${client.clientId}&client_id=${client.clientId}`]
    ]) {
        const response = await fetch(new URL('/api/oauth/token', base), { method: 'POST', headers: { 'Content-Type': mediaType }, body });
        assertOAuthError({ response, data: await response.json() }, 'invalid_request');
    }
    const grant = await publicGrant();
    assert.equal((await token({ ...grant.body, extension: 'ignored' })).response.status, 200);
});

test('both discovery routes describe OAuth capabilities without claiming an OIDC ID-token protocol', async () => {
    for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
        const result = await http(path);
        assert.equal(result.response.status, 200);
        assert.equal(new URL(result.data.issuer).origin, base.origin);
        assert.equal(result.data.authorization_endpoint, new URL('/oauth/authorize', base).toString());
        assert.equal(result.data.token_endpoint, new URL('/api/oauth/token', base).toString());
        assert.equal(result.data.userinfo_endpoint, new URL('/api/oauth/userinfo', base).toString());
        assert.deepEqual(result.data.token_endpoint_auth_methods_supported, ['client_secret_post', 'none']);
        assert.deepEqual(result.data.revocation_endpoint_auth_methods_supported, ['client_secret_post', 'none']);
        assert.equal(result.data.scopes_supported.includes('link:leetcode'), true);
        assert.equal(result.data.scopes_supported.includes('link:clist'), true);
        for (const field of ['jwks_uri', 'id_token_signing_alg_values_supported', 'subject_types_supported', 'claims_supported']) {
            assert.equal(Object.hasOwn(result.data, field), false);
        }
        assert.equal(result.response.headers.get('access-control-allow-origin'), '*');
    }
});

test('public protocol OPTIONS works cross-origin while consent and client APIs never inherit CORS', async () => {
    for (const [path, method, header] of [
        ['/api/oauth/token?extension=1', 'POST', 'Content-Type'], ['/api/oauth/revoke', 'POST', 'Content-Type'],
        ['/api/oauth/userinfo', 'GET', 'Authorization'], ['/.well-known/oauth-authorization-server', 'GET', 'Accept'],
        ['/.well-known/openid-configuration', 'GET', 'Accept']
    ]) {
        const result = await http(path, { method: 'OPTIONS', headers: {
            Origin: 'https://consumer.example', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': header
        } });
        assert.equal(result.response.status, 204);
        assert.equal(result.response.headers.get('access-control-allow-origin'), '*');
        assert.equal(result.response.headers.get('access-control-allow-methods'), `${method}, OPTIONS`);
        assert.equal(result.response.headers.get('access-control-allow-credentials'), null);
    }
    for (const path of ['/api/oauth/authorize', '/api/oauth/clients', '/api/oauth/authorized-apps', '/api/oauth/token/extra']) {
        const result = await http(path, { method: 'OPTIONS', headers: { Origin: 'https://consumer.example' } });
        assert.equal(result.response.headers.get('access-control-allow-origin'), null);
    }
});

test('userinfo CP data matches bound identities, caps rated history and ignores public-page privacy', async () => {
    const { encryptSecret, decodeDataEncryptionKey } = await createJiti(import.meta.url, { fsCache: false })
        .import('../../server/utils/secrets.ts');
    const key = decodeDataEncryptionKey(process.env.NUXT_DATA_ENCRYPTION_KEY || '');
    const accessToken = randomBytes(48).toString('base64url');
    const clistId = randomUUID();
    const linked = [
        { id: clistId, userId: user.id, platform: 'clist', platformUid: prefix,
            oauthAccessToken: encryptSecret(accessToken, `LinkedAccount:oauthAccessToken:${clistId}`, key),
            oauthTokenType: 'Bearer', oauthExpiresAt: new Date(Date.now() + 3600000) },
        { id: randomUUID(), userId: user.id, platform: 'codeforces', platformUid: '101', platformUsername: 'Alice' },
        { id: randomUUID(), userId: user.id, platform: 'atcoder', platformUid: `${prefix}Atcoder`, platformUsername: 'display-name-not-identity' },
        { id: randomUUID(), userId: user.id, platform: 'luogu', platformUid: '000123', platformUsername: 'display-name-not-uid' },
        { id: randomUUID(), userId: user.id, platform: 'leetcode', platformUid: `${prefix}Leetcode`, platformUsername: `${prefix}Leetcode` }
    ];
    const accounts = [
        { id: 1, resource: 'codeforces.com', handle: 'ALICE', rating: 1500, n_contests: 10 },
        { id: 2, resource: 'codeforces.com', handle: 'bob', rating: 9000, n_contests: 999 },
        { id: 3, resource: 'atcoder.jp', handle: `${prefix}Atcoder`.toLowerCase(), rating: 2400, n_contests: 20 },
        { id: 4, resource: 'atcoder.jp', handle: 'display-name-not-identity', rating: 9000, n_contests: 999 },
        { id: 5, resource: 'luogu.com.cn', handle: '123', rating: 1800, n_contests: 30 },
        { id: 6, resource: 'luogu.com.cn', handle: 'display-name-not-uid', rating: 9000, n_contests: 999 },
        { id: 7, resource: 'leetcode.com', handle: `${prefix}Leetcode`, rating: 9000, n_contests: 999 },
        { id: 8, resource: 'unknown.example', handle: 'ALICE', rating: 9000, n_contests: 999 },
        { id: 9, resource: 'codeforces.com', handle: '101', rating: 9000, n_contests: 999 }
    ].map(account => ({ ...account, name: null, resource_rank: 10, last_activity: null }));
    const now = Date.now();
    const statistics = [
        { id: 1, account_id: 2, handle: 'bob', contest_id: 1, event: 'Foreign account contest',
            date: new Date(now).toISOString(), place: 1, score: null, old_rating: 8999, new_rating: 9000, rating_change: 1 },
        { id: 2, account_id: 1, handle: 'ALICE', contest_id: 2, event: 'Unrated contest',
            date: new Date(now).toISOString(), place: 1, score: null, old_rating: null, new_rating: null, rating_change: null },
        ...Array.from({ length: 205 }, (_, index) => ({
            id: index + 3, account_id: index === 0 ? 3 : 1,
            handle: index === 0 ? `${prefix}Atcoder` : 'ALICE', contest_id: index + 3,
            event: index === 0 ? 'AtCoder Heuristic Contest 001' : `Matched contest ${index}`,
            date: new Date(now - index * 1000).toISOString(), place: index + 1,
            score: null, old_rating: 1499 + index, new_rating: 1500 + index, rating_change: 1
        }))
    ];
    const cacheKeys = [`clist:v2:accounts:${hash(accessToken)}`, `clist:v2:stats:${hash(accessToken)}:200`];
    try {
        await prisma.linkedAccount.createMany({ data: linked });
        await redis.set(cacheKeys[0], JSON.stringify(accounts), 'EX', 60);
        await redis.set(cacheKeys[1], JSON.stringify(statistics), 'EX', 60);
        const issued = await token((await publicGrant({ scopes: ['cp:summary', 'cp:details'] })).body);
        assert.equal(issued.response.status, 200);
        const headers = { Authorization: `Bearer ${issued.data.access_token}` };
        const result = await http('/api/oauth/userinfo', { headers });
        assert.equal(result.response.status, 200);
        assert.equal(result.data.cp_summary.available, true);
        assert.deepEqual(result.data.cp_summary.accounts.map(account => [account.resource, account.handle]), [
            ['codeforces.com', 'ALICE'], ['atcoder.jp', `${prefix}Atcoder`.toLowerCase()], ['luogu.com.cn', '123']
        ]);
        assert.equal(result.data.cp_summary.total_contests, 60);
        assert.equal(result.data.cp_summary.highest_rating.rating, 2400);
        assert.equal(result.data.cp_details.available, true);
        assert.equal(result.data.cp_details.rating_history.length, 200);
        assert.equal(result.data.cp_details.rating_history[0].resource, 'atcoder.jp/heuristic');
        assert.equal(result.data.cp_details.rating_history.some(item => item.handle === 'bob' || item.new_rating === null), false);
        assert.equal(Object.hasOwn(result.data, 'linked_accounts'), false);
        assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).publicCpStats, false);
        await prisma.linkedAccount.update({ where: { id: clistId }, data: {
            oauthAccessToken: encryptSecret(accessToken, `LinkedAccount:oauthAccessToken:${randomUUID()}`, key)
        } });
        const unavailable = await http('/api/oauth/userinfo', { headers });
        assert.equal(unavailable.response.status, 200);
        assert.equal(unavailable.data.cp_summary.available, false);
        assert.equal(unavailable.data.cp_details.available, false);
    } finally {
        await redis.del(...cacheKeys);
        await prisma.linkedAccount.deleteMany({ where: { id: { in: linked.map(account => account.id) } } });
    }
});
