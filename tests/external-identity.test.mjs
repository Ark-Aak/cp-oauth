import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import jwt from 'jsonwebtoken';
import { ofetch } from 'ofetch';

const jiti = createJiti(import.meta.url, {
    alias: { '~': fileURLToPath(new URL('../', import.meta.url)) }, fsCache: false
});
const { resolveCodeforcesIdentity } = await jiti.import('../server/utils/codeforces-oauth.ts');
const { fetchLeetcodeProfile } = await jiti.import('../server/utils/leetcode-fetch.ts');
const originalFetch = globalThis.$fetch;
afterEach(() => { globalThis.$fetch = originalFetch; });
const clientId = 'test-codeforces-client';
const clientSecret = 'codeforces-fixture-secret-not-a-runtime-key';
const discovery = {
    issuer: 'https://codeforces.com',
    authorization_endpoint: 'https://codeforces.com/oauth/authorize',
    token_endpoint: 'https://codeforces.com/oauth/token',
    id_token_signing_alg_values_supported: ['HS256']
};

function signedIdentity(overrides = {}, signingSecret = clientSecret, algorithm = 'HS256') {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
        iss: discovery.issuer, aud: clientId, sub: '317',
        iat: now, exp: now + 3600, handle: 'tourist',
        avatar: 'https://userpic.codeforces.org/317/avatar.png', ...overrides
    };
    return jwt.sign(claims, signingSecret, { algorithm });
}

async function resolve(idToken, metadata = discovery) {
    return resolveCodeforcesIdentity({
        clientId, clientSecret, discovery: metadata,
        token: { access_token: 'external-access', id_token: idToken }
    });
}

test('Codeforces identity comes from verified sub, handle and avatar claims', async () => {
    const identity = await resolve(signedIdentity());
    assert.equal(identity.platformUid, '317');
    assert.equal(identity.platformUsername, 'tourist');
    assert.equal(identity.avatarUrl, 'https://userpic.codeforces.org/317/avatar.png');
});

test('rejects a Codeforces identity signed with another secret', async () => {
    await assert.rejects(resolve(signedIdentity({}, 'attacker-secret')), { statusCode: 502 });
});

for (const [label, overrides] of [
    ['issuer', { iss: 'https://attacker.invalid' }],
    ['audience', { aud: 'other-client' }],
    ['expired token', { exp: 1 }],
    ['numeric subject', { sub: 317 }],
    ['blank subject', { sub: ' ' }],
    ['missing expiry', { exp: undefined }],
    ['missing issued-at', { iat: undefined }],
    ['missing handle', { handle: undefined }]
]) {
    test(`rejects Codeforces ${label}`, async () => {
        let token;
        if (label === 'numeric subject') {
            // jsonwebtoken's signer also rejects numeric sub: create an actual signed raw payload.
            const payload = JSON.stringify({ iss: discovery.issuer, aud: clientId, iat: 1, exp: 4102444800, handle: 'tourist', ...overrides });
            token = jwt.sign(Buffer.from(payload), clientSecret, { algorithm: 'HS256' });
        } else if (label === 'missing expiry' || label === 'missing issued-at') {
            const now = Math.floor(Date.now() / 1000);
            const claims = { iss: discovery.issuer, aud: clientId, sub: '317', iat: now, exp: now + 3600, handle: 'tourist' };
            delete claims[label === 'missing expiry' ? 'exp' : 'iat'];
            token = jwt.sign(Buffer.from(JSON.stringify(claims)), clientSecret, { algorithm: 'HS256' });
        } else {
            token = signedIdentity(overrides);
        }
        await assert.rejects(resolve(token), { statusCode: 502 });
    });
}

test('does not downgrade Codeforces unsupported signing algorithms to decode-only identity', async () => {
    await assert.rejects(resolve(signedIdentity({}, clientSecret, 'HS512')), { statusCode: 502 });
    await assert.rejects(resolve(signedIdentity(), { ...discovery, id_token_signing_alg_values_supported: ['RS256'] }), { statusCode: 502 });
});

test('LeetCode null means a real missing profile', async () => {
    globalThis.$fetch = ofetch.create({ retry: 0 }, {
        fetch: async () => Response.json({ data: { userProfilePublicProfile: null, userProfileUserQuestionProgress: null } })
    });
    assert.equal(await fetchLeetcodeProfile('missing-user'), null);
});

for (const status of [401, 429, 500]) {
    test(`LeetCode HTTP ${status} is an upstream error, not a missing user`, async () => {
        globalThis.$fetch = ofetch.create({ retry: 0 }, {
            fetch: async () => new Response(null, { status })
        });
        await assert.rejects(fetchLeetcodeProfile('existing-user'), { statusCode: 502 });
    });
}

test('LeetCode GraphQL errors never authenticate a partial returned profile', async () => {
    globalThis.$fetch = ofetch.create({ retry: 0 }, {
        fetch: async () => Response.json({ errors: [{ message: 'Upstream unavailable' }], data: { userProfilePublicProfile: null, userProfileUserQuestionProgress: null } })
    });
    await assert.rejects(fetchLeetcodeProfile('existing-user'), { statusCode: 502 });
});

test('LeetCode malformed responses are not treated as a missing user', async () => {
    globalThis.$fetch = ofetch.create({ retry: 0 }, { fetch: async () => Response.json({ data: {} }) });
    await assert.rejects(fetchLeetcodeProfile('existing-user'), { statusCode: 502 });
});

test('an empty LeetCode username is invalid input, not a missing profile', async () => {
    await assert.rejects(fetchLeetcodeProfile(' '), { statusCode: 400 });
});
