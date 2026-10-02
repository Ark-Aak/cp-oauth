import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { getSafeRedirectTarget, buildLoginPath } = await jiti.import('../utils/auth-redirect.ts');

test('untrusted return paths cannot resolve to another origin', () => {
    for (const path of ['//attacker.invalid', '/\\attacker.invalid', 'https://attacker.invalid', '/%5cattacker.invalid', '/\n/attacker.invalid', '/%0d%0aevil']) {
        assert.equal(getSafeRedirectTarget(path), '/');
    }
    assert.equal(getSafeRedirectTarget(null, '/profile'), '/profile');
});

test('authorization queries and local fragments survive authentication', () => {
    const target = '/oauth/authorize?client_id=a&redirect_uri=https%3A%2F%2Fclient.test%2Fcb&state=a%2Bb#permissions';
    assert.equal(getSafeRedirectTarget(target), target);
    assert.equal(getSafeRedirectTarget([target, '//attacker.invalid']), target);
    assert.equal(new URL(buildLoginPath(target), 'https://cp-oauth.test').searchParams.get('redirect'), target);
});
