import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { createJiti } from 'jiti';

const databaseUrl = process.env.DATABASE_URL;
const baseUrl = process.env.TEST_BASE_URL;
const enabled = Boolean(databaseUrl && baseUrl);
if (enabled) {
    const database = new URL(databaseUrl);
    const base = new URL(baseUrl);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.pathname.endsWith('_test')) {
        throw new Error('Identity mail integration requires a database ending in _test');
    }
    if (!['http:', 'https:'].includes(base.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
        throw new Error('TEST_BASE_URL must be loopback');
    }
}

const hash = value => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('hex');

test('email and password HTTP transitions preserve identity and consume security state once', {
    skip: !enabled && 'Set DATABASE_URL and TEST_BASE_URL to an isolated running test application',
    timeout: 90_000
}, async t => {
    const jiti = createJiti(import.meta.url, {
        alias: { '~': fileURLToPath(new URL('../../', import.meta.url)) },
        fsCache: false
    });
    const { default: prisma } = await jiti.import('../../server/utils/prisma.ts');
    const fixtures = [];
    const cookies = [];
    const password = 'identity-mail-initial-password';
    const passwordHash = await bcrypt.hash(password, 4);
    const origin = new URL(process.env.NUXT_PUBLIC_SITE_ORIGIN || baseUrl).origin;
    const redirect = '/oauth/authorize?client_id=fixture&state=mail-return';
    const request = (path, { method = 'GET', body, cookie } = {}) => fetch(new URL(path, baseUrl), {
        method,
        redirect: 'manual',
        headers: {
            'X-CP-OAuth-CSRF': '1',
            Origin: origin,
            'Sec-Fetch-Site': 'same-origin',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(cookie ? { Cookie: cookie } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const json = async (path, options) => {
        const response = await request(path, options);
        return { response, body: await response.json() };
    };
    const sessionCookie = response => {
        const cookie = response.headers.getSetCookie()
            .map(value => value.split(';', 1)[0])
            .find(value => value.startsWith('cp_oauth_session=') && value !== 'cp_oauth_session=');
        assert.ok(cookie, 'Successful authentication or rotation issues an opaque session cookie');
        cookies.push(cookie);
        return cookie;
    };
    const createUser = async (data = {}) => {
        const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
        const user = await prisma.user.create({ data: {
            username: `im_${suffix}`,
            email: `${suffix}@identity-mail.example.test`,
            passwordHash,
            emailVerified: true,
            ...data
        } });
        fixtures.push(user.id);
        return user;
    };
    const login = async user => {
        const result = await json('/api/auth/login', { method: 'POST', body: { email: user.email, password } });
        assert.equal(result.response.status, 200);
        assert.equal(result.body.authenticated, true);
        return sessionCookie(result.response);
    };
    const proof = async (cookie, purpose, currentPassword = password) => {
        const result = await json('/api/auth/reauth', {
            method: 'POST', cookie,
            body: { purpose, method: 'password', password: currentPassword, redirect }
        });
        assert.equal(result.response.status, 200);
        assert.equal(result.body.purpose, purpose);
        return result.body.reauthToken;
    };
    const confirm = token => request(`/api/auth/verify?${new URLSearchParams({ token, redirect })}`);
    const confirmationStatus = response => new URL(response.headers.get('location'), baseUrl).searchParams.get('status');
    const seedGrants = async userId => {
        const client = await prisma.oAuthClient.create({ data: {
            userId,
            name: 'Identity recovery fixture',
            clientSecretHash: passwordHash,
            redirectUris: ['https://identity-mail.example.test/callback']
        } });
        const grant = { userId, clientId: client.clientId, scopes: ['openid'], expiresAt: new Date(Date.now() + 60_000) };
        const code = await prisma.oAuthAuthorizationCode.create({ data: {
            ...grant, codeHash: hash(randomToken()), redirectUri: client.redirectUris[0]
        } });
        const access = await prisma.oAuthAccessToken.create({ data: { ...grant, tokenHash: hash(randomToken()) } });
        const refresh = await prisma.oAuthRefreshToken.create({ data: { ...grant, tokenHash: hash(randomToken()) } });
        return { code, access, refresh };
    };
    const assertGrantsRevoked = async grants => {
        assert.equal(await prisma.oAuthAuthorizationCode.findUnique({ where: { id: grants.code.id } }), null);
        assert.equal(await prisma.oAuthAccessToken.findUnique({ where: { id: grants.access.id } }), null);
        assert.equal((await prisma.oAuthRefreshToken.findUnique({ where: { id: grants.refresh.id } })).revoked, true);
    };

    try {
        const alice = await createUser();
        let cookie = await login(alice);

        await t.test('a pending email needs proof and does not replace the verified MFA recipient', async () => {
            const newEmail = `${randomUUID()}@pending.example.test`;
            const denied = await json('/api/auth/me', { method: 'PATCH', cookie, body: { email: newEmail } });
            assert.ok([401, 403].includes(denied.response.status));
            assert.equal((await prisma.user.findUnique({ where: { id: alice.id } })).pendingEmail, null);

            const token = await proof(cookie, 'email_change');
            const result = await json('/api/auth/me', {
                method: 'PATCH', cookie, body: { email: newEmail, reauthToken: token, redirect }
            });
            assert.equal(result.response.status, 200);
            assert.equal(result.body.email, alice.email);
            assert.equal(result.body.emailVerified, true);
            assert.equal(result.body.pendingEmail, newEmail);
            const pending = await prisma.user.findUnique({ where: { id: alice.id } });
            assert.equal(pending.email, alice.email);
            assert.equal(pending.authVersion, alice.authVersion);
            const remaining = pending.pendingEmailExpiresAt.getTime() - Date.now();
            assert.ok(remaining > 23 * 60 * 60_000 && remaining <= 24 * 60 * 60_000);

            const previousToken = randomToken();
            await prisma.user.update({ where: { id: alice.id }, data: { pendingEmailTokenHash: hash(previousToken) } });
            const resend = await json('/api/auth/verify', { method: 'POST', cookie, body: { redirect } });
            assert.equal(resend.response.status, 200);
            assert.equal(resend.body.pendingEmail, true);
            assert.equal(confirmationStatus(await confirm(previousToken)), 'error');
            assert.equal((await prisma.user.findUnique({ where: { id: alice.id } })).email, alice.email);
        });

        await t.test('strict dirty patches reject string booleans and leave unrelated profile fields intact', async () => {
            await prisma.user.update({ where: { id: alice.id }, data: { bio: 'Keep this biography', publicCpStats: true } });
            for (const body of [{ publicCpStats: 'false' }, { role: 'admin' }, { email: [] }]) {
                const result = await json('/api/auth/me', { method: 'PATCH', cookie, body });
                assert.equal(result.response.status, 400);
                assert.equal(result.body.data.code, 'VALIDATION_ERROR');
            }
            const saved = await json('/api/auth/me', { method: 'PATCH', cookie, body: { publicCpStats: false } });
            assert.equal(saved.response.status, 200);
            assert.equal(saved.body.publicCpStats, false);
            assert.equal(saved.body.bio, 'Keep this biography');
        });

        await t.test('a competing email confirmation commits one owner and preserves the losing account', async () => {
            const bob = await createUser();
            const carol = await createUser();
            const pendingEmail = `${randomUUID()}@race.example.test`;
            const tokens = [randomToken(), randomToken()];
            for (const [index, user] of [bob, carol].entries()) {
                await prisma.user.update({ where: { id: user.id }, data: {
                    pendingEmail,
                    pendingEmailTokenHash: hash(tokens[index]),
                    pendingEmailExpiresAt: new Date(Date.now() + 60_000),
                    passwordResetToken: hash(randomToken()),
                    passwordResetExpiresAt: new Date(Date.now() + 60_000)
                } });
            }
            const responses = await Promise.all(tokens.map(confirm));
            assert.deepEqual(responses.map(confirmationStatus).sort(), ['conflict', 'success']);
            const winner = responses.findIndex(response => confirmationStatus(response) === 'success');
            const rows = await Promise.all([bob, carol].map(user => prisma.user.findUnique({ where: { id: user.id } })));
            assert.equal(rows[winner].email, pendingEmail);
            assert.equal(rows[winner].pendingEmail, null);
            assert.equal(rows[winner].passwordResetToken, null);
            assert.equal(rows[winner].authVersion, 1);
            assert.equal(rows[1 - winner].email, [bob, carol][1 - winner].email);
            assert.equal(rows[1 - winner].pendingEmailTokenHash, hash(tokens[1 - winner]));
            assert.equal(rows[1 - winner].authVersion, 0);
            const resultUrl = new URL(responses[1 - winner].headers.get('location'), baseUrl);
            assert.equal(resultUrl.searchParams.get('redirect'), redirect);
            const resultPage = await fetch(resultUrl);
            assert.equal(resultPage.status, 409);
            assert.equal(confirmationStatus(await confirm(tokens[winner])), 'error');
        });

        await t.test('expired verification tokens cannot change a primary email or create a session', async () => {
            const token = randomToken();
            const user = await createUser({
                emailVerified: false,
                emailVerifyToken: hash(token),
                emailVerifyExpiresAt: new Date(Date.now() - 1000)
            });
            const result = await confirm(token);
            assert.equal(confirmationStatus(result), 'expired');
            assert.equal(result.headers.getSetCookie().some(value => /^cp_oauth_session=[^;]/.test(value)), false);
            const unchanged = await prisma.user.findUnique({ where: { id: user.id } });
            assert.equal(unchanged.emailVerified, false);
            assert.equal(unchanged.authVersion, 0);
        });

        await t.test('password changes require proof, rotate this browser and revoke every outstanding grant', async () => {
            const otherSession = await login(alice);
            const grants = await seedGrants(alice.id);
            const noProof = await json('/api/auth/password/change', {
                method: 'POST', cookie,
                body: { currentPassword: password, newPassword: 'password-alone-is-not-enough' }
            });
            assert.ok([401, 403].includes(noProof.response.status));
            assert.equal((await prisma.user.findUnique({ where: { id: alice.id } })).authVersion, 0);
            const token = await proof(cookie, 'password_change');
            const tooLong = await json('/api/auth/password/change', {
                method: 'POST', cookie, body: { newPassword: '中'.repeat(25), reauthToken: token }
            });
            assert.equal(tooLong.response.status, 400);
            assert.equal(tooLong.body.data.code, 'VALIDATION_ERROR');
            const nextPassword = '中'.repeat(24);
            const changed = await json('/api/auth/password/change', {
                method: 'POST', cookie, body: { newPassword: nextPassword, reauthToken: token }
            });
            assert.equal(changed.response.status, 200);
            cookie = sessionCookie(changed.response);
            const current = await prisma.user.findUnique({ where: { id: alice.id } });
            assert.equal(await bcrypt.compare(nextPassword, current.passwordHash), true);
            assert.equal(current.authVersion, 1);
            assert.equal(current.pendingEmail, null);
            assert.equal((await request('/api/auth/me', { cookie })).status, 200);
            assert.equal((await request('/api/auth/me', { cookie: otherSession })).status, 401);
            await assertGrantsRevoked(grants);
        });

        await t.test('expired reset tokens preserve the old password and authentication version', async () => {
            const token = randomToken();
            const user = await createUser({
                passwordResetToken: hash(token),
                passwordResetExpiresAt: new Date(Date.now() - 1000)
            });
            const result = await json('/api/auth/password/reset', {
                method: 'POST', body: { token, newPassword: 'must-not-become-the-password' }
            });
            assert.equal(result.response.status, 400);
            assert.equal(result.body.data.code, 'RESET_TOKEN_INVALID_OR_EXPIRED');
            const unchanged = await prisma.user.findUnique({ where: { id: user.id } });
            assert.equal(await bcrypt.compare(password, unchanged.passwordHash), true);
            assert.equal(unchanged.authVersion, 0);
        });

        await t.test('password reset validates bytes before consumption and a concurrent replay cannot win twice', async () => {
            const token = randomToken();
            const pendingEmail = `${randomUUID()}@abandoned.example.test`;
            await prisma.user.update({ where: { id: alice.id }, data: {
                passwordResetToken: hash(token),
                passwordResetExpiresAt: new Date(Date.now() + 60_000),
                pendingEmail,
                pendingEmailTokenHash: hash(randomToken()),
                pendingEmailExpiresAt: new Date(Date.now() + 60_000)
            } });
            for (const newPassword of ['short', 'a'.repeat(73), '中'.repeat(25), { password: 'wrong type' }]) {
                const rejected = await json('/api/auth/password/reset', { method: 'POST', body: { token, newPassword } });
                assert.equal(rejected.response.status, 400);
                assert.equal(rejected.body.data.code, 'VALIDATION_ERROR');
                assert.equal((await prisma.user.findUnique({ where: { id: alice.id } })).passwordResetToken, hash(token));
            }
            const grants = await seedGrants(alice.id);
            const passwords = ['first-reset-password', 'second-reset-password'];
            const attempts = await Promise.all(passwords.map(newPassword => json('/api/auth/password/reset', {
                method: 'POST', cookie, body: { token, newPassword, redirect }
            })));
            assert.deepEqual(attempts.map(result => result.response.status).sort(), [200, 400]);
            const winner = attempts.findIndex(result => result.response.status === 200);
            assert.equal(attempts[1 - winner].body.data.code, 'RESET_TOKEN_INVALID_OR_EXPIRED');
            assert.equal(attempts[winner].body.redirect, redirect);
            assert.ok(attempts[winner].response.headers.getSetCookie().some(value => /^cp_oauth_session=;/.test(value)));
            const current = await prisma.user.findUnique({ where: { id: alice.id } });
            assert.equal(await bcrypt.compare(passwords[winner], current.passwordHash), true);
            assert.equal(current.authVersion, 2);
            assert.equal(current.pendingEmail, null);
            assert.equal(current.pendingEmailTokenHash, null);
            assert.equal(current.passwordResetToken, null);
            assert.equal((await request('/api/auth/me', { cookie })).status, 401);
            await assertGrantsRevoked(grants);
        });

        await t.test('forgot returns the same response for a normalized existing email and an unknown email', async () => {
            const known = await json('/api/auth/password/forgot', {
                method: 'POST', body: { email: `  ${alice.email.toUpperCase()}  `, redirect }
            });
            const unknown = await json('/api/auth/password/forgot', {
                method: 'POST', body: { email: `${randomUUID()}@unknown.example.test`, redirect }
            });
            assert.equal(known.response.status, 200);
            assert.equal(unknown.response.status, 200);
            assert.deepEqual(known.body, { success: true });
            assert.deepEqual(unknown.body, known.body);
        });
    } finally {
        for (const cookie of cookies) {
            await request('/api/auth/logout', { method: 'POST', cookie }).catch(() => {});
        }
        await prisma.user.deleteMany({ where: { id: { in: fixtures } } });
        await prisma.$disconnect();
    }
});
