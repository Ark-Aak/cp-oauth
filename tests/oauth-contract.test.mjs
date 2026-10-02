import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '~': fileURLToPath(new URL('../', import.meta.url)) }, fsCache: false
});
const { validateScopes, verifyPKCE } = await jiti.import('../server/utils/oauth.ts');
const { isSafeOAuthRedirectUri } = await jiti.import('../utils/oauth-redirect.ts');
const {
    oauthParametersFromSearchParams, parseOAuthAuthorizationQuery, parseOAuthAuthorizationConsent,
    oauthClientCreateSchema, oauthClientPatchSchema
} = await jiti.import('../server/utils/oauth-request.ts');
const hash = value => createHash('sha256').update(value).digest('hex');
const verifier = 'a'.repeat(43);
const query = {
    response_type: 'code', client_id: 'client', redirect_uri: 'https://consumer.example/callback',
    scope: 'profile email profile', state: ''
};

for (const uri of [
    'https://consumer.example/callback?one=1', 'https://consumer.example:8443/callback',
    'http://localhost/callback', 'http://localhost:3100/callback',
    'http://127.0.0.1:3100/callback', 'http://[::1]:3100/callback'
]) {
    test(`accepts an HTTPS or literal loopback redirect: ${uri}`, () => {
        assert.equal(isSafeOAuthRedirectUri(uri), true);
    });
}
for (const uri of [
    'http://consumer.example/callback', 'http://localhost.attacker.example/callback',
    'http://127.1/callback', 'http://2130706433/callback', 'http://0x7f000001/callback',
    'https://user:password@consumer.example/callback', 'https://@consumer.example/callback',
    'https://consumer.example/callback#fragment', 'https://consumer.example/callback#',
    'https://consumer.example\\@attacker.example/callback', 'https:///callback',
    '//consumer.example/callback', 'javascript:alert(1)', 'https://consumer.example/callback\n'
]) {
    test(`rejects an unsafe redirect: ${JSON.stringify(uri)}`, () => {
        assert.equal(isSafeOAuthRedirectUri(uri), false);
    });
}

test('scopes must be a non-empty collection of registry-owned names, and need not include openid', () => {
    assert.equal(validateScopes([]), false);
    assert.equal(validateScopes(['profile']), true);
    for (const scope of ['toString', 'constructor', '__proto__', 'unregistered']) {
        assert.equal(validateScopes([scope]), false);
        assert.throws(() => parseOAuthAuthorizationQuery({ ...query, scope }), { code: 'invalid_scope' });
    }
    assert.throws(() => parseOAuthAuthorizationQuery({ ...query, scope: '   ' }), { code: 'invalid_scope' });
});

test('authorization scopes deduplicate in request order and preserve an empty state', () => {
    const parsed = parseOAuthAuthorizationQuery({ ...query, extension: 'ignored' });
    assert.deepEqual(parsed.scopes, ['profile', 'email']);
    assert.equal(parsed.state, '');
    assert.equal(parsed.codeChallenge, undefined);
});

test('authorization query rejects repeated and non-scalar parameters', () => {
    assert.throws(() => oauthParametersFromSearchParams(new URLSearchParams('scope=profile&scope=email')), { code: 'invalid_request' });
    for (const patch of [
        { client_id: ['client', 'other'] }, { state: ['a', 'b'] }, { scope: ['profile'] },
        { redirect_uri: {} }, { response_type: 'token' }, { extension: ['a', 'b'] }
    ]) {
        assert.throws(() => parseOAuthAuthorizationQuery({ ...query, ...patch }), { code: 'invalid_request' });
    }
});

test('consent requires a real boolean and preserves the established scopes array contract', () => {
    const consent = {
        client_id: query.client_id, redirect_uri: query.redirect_uri, scopes: ['profile', 'email', 'profile'],
        approved: false, state: '', code_challenge: null, code_challenge_method: null
    };
    const parsed = parseOAuthAuthorizationConsent(consent);
    assert.equal(parsed.approved, false);
    assert.equal(parsed.state, '');
    assert.deepEqual(parsed.scopes, ['profile', 'email']);
    assert.throws(() => parseOAuthAuthorizationConsent({ ...consent, approved: 'false' }), { code: 'invalid_request' });
    assert.throws(() => parseOAuthAuthorizationConsent({ ...consent, scopes: 'profile' }), { code: 'invalid_request' });
    assert.throws(() => parseOAuthAuthorizationConsent({ ...consent, scopes: [] }), { code: 'invalid_scope' });
    for (const extension of [[], {}, false, 1]) {
        assert.throws(() => parseOAuthAuthorizationConsent({ ...consent, extension }), { code: 'invalid_request' });
    }
    assert.deepEqual(parseOAuthAuthorizationConsent({ ...consent, extension: 'ignored' }).scopes, ['profile', 'email']);
});

test('PKCE method defaults to plain only when a valid challenge exists', () => {
    const parsed = parseOAuthAuthorizationQuery({ ...query, code_challenge: verifier });
    assert.equal(parsed.codeChallengeMethod, 'plain');
    for (const patch of [
        { code_challenge_method: 'S256' }, { code_challenge: '' },
        { code_challenge: verifier, code_challenge_method: 'unsupported' },
        { code_challenge: 'a'.repeat(42) }, { code_challenge: 'a'.repeat(129) },
        { code_challenge: 'a'.repeat(42) + '/', code_challenge_method: 'S256' },
        { code_challenge: 'a'.repeat(44), code_challenge_method: 'S256' },
        { code_challenge: verifier, code_challenge_method: '' }
    ]) {
        assert.throws(() => parseOAuthAuthorizationQuery({ ...query, ...patch }), { code: 'invalid_request' });
    }
});

test('PKCE verifies hashed plain and S256 challenges without accepting a raw fallback', () => {
    const s256 = createHash('sha256').update(verifier).digest('base64url');
    assert.equal(verifyPKCE(verifier, hash(verifier), null), true);
    assert.equal(verifyPKCE(verifier, hash(verifier), 'plain'), true);
    assert.equal(verifyPKCE(verifier, hash(s256), 'S256'), true);
    assert.equal(verifyPKCE('b'.repeat(43), hash(s256), 'S256'), false);
    assert.equal(verifyPKCE(verifier, verifier, 'plain'), false);
    assert.equal(verifyPKCE(verifier, hash(verifier), 'unsupported'), false);
    for (const invalid of ['a'.repeat(42), 'a'.repeat(129), 'a'.repeat(42) + '/', 'a'.repeat(42) + 'é']) {
        assert.equal(verifyPKCE(invalid, hash(invalid), 'plain'), false);
    }
    for (const valid of ['a'.repeat(128), '.'.repeat(43), '~'.repeat(43), '_'.repeat(43), '-'.repeat(43)]) {
        assert.equal(verifyPKCE(valid, hash(valid), 'plain'), true);
    }
});

test('client writes enforce limits and booleans without validating unchanged legacy names', () => {
    const draft = { name: '  Application  ', redirectUris: ['https://consumer.example/callback'], requireEmailVerified: true };
    assert.equal(oauthClientCreateSchema.parse(draft).name, 'Application');
    assert.deepEqual(oauthClientCreateSchema.parse({ ...draft, redirectUris: [...draft.redirectUris, ...draft.redirectUris] }).redirectUris, draft.redirectUris);
    for (const patch of [
        { name: '' }, { name: 'a'.repeat(101) }, { redirectUris: [] },
        { redirectUris: Array(21).fill('https://consumer.example/callback') },
        { redirectUris: ['https://consumer.example/' + 'a'.repeat(2048)] },
        { redirectUris: ['http://consumer.example/callback'] }, { requireEmailVerified: 'false' },
        { role: 'admin' }
    ]) {
        assert.equal(oauthClientCreateSchema.safeParse({ ...draft, ...patch }).success, false);
    }
    assert.equal(oauthClientPatchSchema.safeParse({}).success, false);
    assert.deepEqual(oauthClientPatchSchema.parse({ requireEmailVerified: false }), { requireEmailVerified: false });
});
