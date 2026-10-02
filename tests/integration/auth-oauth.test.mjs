import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import sanitizeHtml from 'sanitize-html';

const base = new URL(process.env.TEST_BASE_URL || '');
const database = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || !database.pathname.endsWith('_test')) throw new Error('Integration tests require an explicit loopback test server and _test database');
const prisma = new PrismaClient();
const redis = new Redis(process.env.NUXT_REDIS_URL, { enableOfflineQueue: false });
const prefix = `it_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const password = 'Integration-password-1';
const ids = [];
let user;
let cookie;
async function request(path, body, session = cookie, headers = {}) {
    const response = await fetch(new URL(path, base), {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CP-OAuth-CSRF': '1', Origin: base.origin, ...(session ? { Cookie: session } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual'
    });
    const text = await response.text();
    return { response, data: text ? JSON.parse(text) : null };
}
before(async () => {
    user = await prisma.user.create({ data: { username: prefix, email: `${prefix}@example.test`, passwordHash: await bcrypt.hash(password, 10), emailVerified: true } });
    ids.push(user.id);
});
after(async () => {
    for (const id of ids) {
        const key = `cp-oauth:v2:auth:user-sessions:${id}`;
        const sessions = await redis.smembers(key);
        await redis.del(key, ...sessions.map(sid => `cp-oauth:v2:auth:session:${sid}`));
    }
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    await redis.quit();
});

test('SSR credential controls cannot leak credentials through native GET submission', async () => {
    const response = await fetch(new URL('/login', base));
    const elements = [];
    sanitizeHtml(await response.text(), { onOpenTag(tag, attributes) { elements.push({ tag, attributes }); } });
    const credentials = elements.filter(x => x.tag === 'input' && ['email', 'password'].includes(x.attributes.name));
    assert.deepEqual(credentials.map(x => x.attributes.name).sort(), ['email', 'password']);
    for (const input of credentials) {
        assert.equal(Object.hasOwn(input.attributes, 'disabled'), true);
    }
    for (const form of elements.filter(x => x.tag === 'form')) assert.equal(form.attributes.method, 'post');
    for (const button of elements.filter(x => x.tag === 'button' && x.attributes.type === 'submit')) assert.equal(Object.hasOwn(button.attributes, 'disabled'), true);
});

test('real first-party login normalizes email, returns HttpOnly cookie, and SSR sees identity', async () => {
    const result = await request('/api/auth/login', { email: ` ${user.email.toUpperCase()} `, password, redirect: '/profile?tab=bindings' }, null);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.authenticated, true);
    assert.equal(result.data.redirect, '/profile?tab=bindings');
    assert.equal(Object.hasOwn(result.data, 'token'), false);
    const setCookie = result.response.headers.getSetCookie().find(value => value.startsWith('cp_oauth_session='));
    assert.ok(setCookie?.includes('HttpOnly'));
    assert.ok(setCookie?.includes('SameSite=Lax'));
    cookie = setCookie.split(';')[0];
    const me = await request('/api/auth/me');
    assert.equal(me.response.status, 200);
    assert.equal(me.data.id, user.id);
    const page = await fetch(new URL('/profile', base), { headers: { Cookie: cookie } });
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes(user.username));
});

test('cross-origin unsafe requests cannot change first-party data', async () => {
    const response = await fetch(new URL('/api/auth/me', base), { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://attacker.invalid', 'X-CP-OAuth-CSRF': '1' }, body: JSON.stringify({ displayName: 'unauthorized' }) });
    assert.equal(response.status, 403);
    assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).displayName, null);
});

test('string privacy writes fail rather than exposing data', async () => {
    const response = await fetch(new URL('/api/auth/me', base), { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: base.origin, 'X-CP-OAuth-CSRF': '1' }, body: JSON.stringify({ publicCpStats: 'false' }) });
    assert.equal(response.status, 400);
    assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).publicCpStats, false);
});

test('a session alone cannot persist an attacker email address', async () => {
    const response = await fetch(new URL('/api/auth/me', base), { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: base.origin, 'X-CP-OAuth-CSRF': '1' }, body: JSON.stringify({ email: `attacker_${prefix}@example.test` }) });
    assert.equal((await response.json()).data.code, 'REAUTH_REQUIRED');
    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(stored.email, user.email);
    assert.equal(stored.pendingEmail, null);
    assert.equal((await request('/api/auth/me')).response.status, 200);
});

test('fresh password reauthentication creates a pending intent without changing recovery address', async () => {
    const proof = await request('/api/auth/reauth', { purpose: 'email_change', method: 'password', password, redirect: '/profile?tab=basic' });
    assert.equal(proof.response.status, 200);
    assert.equal(proof.data.purpose, 'email_change');
    const response = await fetch(new URL('/api/auth/me', base), { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: base.origin, 'X-CP-OAuth-CSRF': '1' }, body: JSON.stringify({ email: `new_${prefix}@example.test`, reauthToken: proof.data.reauthToken }) });
    assert.equal(response.status, 200);
    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(stored.email, user.email);
    assert.equal(stored.pendingEmail, `new_${prefix}@example.test`);
    assert.ok(stored.pendingEmailTokenHash);
    assert.ok(stored.pendingEmailExpiresAt > new Date());
    assert.equal(stored.authVersion, 0);
    const replay = await fetch(new URL('/api/auth/me', base), { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: base.origin, 'X-CP-OAuth-CSRF': '1' }, body: JSON.stringify({ email: `other_${prefix}@example.test`, reauthToken: proof.data.reauthToken }) });
    assert.equal((await replay.json()).data.code, 'REAUTH_REQUIRED');
    assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).pendingEmail, `new_${prefix}@example.test`);
});

test('logout revokes the server-side session and rejects replay', async () => {
    const result = await request('/api/auth/logout', {});
    assert.equal(result.response.status, 204);
    const replay = await request('/api/auth/me');
    assert.equal(replay.response.status, 401);
});
