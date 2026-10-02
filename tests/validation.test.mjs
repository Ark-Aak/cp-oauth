import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { fsCache: false });
const { emailSchema, newPasswordSchema, profilePatchSchema } = await jiti.import('../utils/validation.ts');

test('privacy accepts booleans and rejects string coercion without changing their meaning', () => {
    assert.equal(profilePatchSchema.parse({ publicCpStats: false }).publicCpStats, false);
    for (const value of ['false', 'true', 0, null, {}, []]) {
        assert.equal(profilePatchSchema.safeParse({ publicCpStats: value }).success, false);
        assert.equal(profilePatchSchema.safeParse({ publicRatingHistory: value }).success, false);
    }
});

test('profile rejects privilege writes, unknown platforms, dangerous URLs and invalid preferences', () => {
    for (const input of [{ role: 'admin' }, { publicLinkedPlatforms: ['unknown'] }, { avatarUrl: 'javascript:alert(1)' }, { avatarUrl: 'https://user:pass@example.com' }, { theme: 'blue' }, { locale: 'fr' }, { bio: 'x'.repeat(501) }]) {
        assert.equal(profilePatchSchema.safeParse(input).success, false);
    }
    assert.deepEqual(profilePatchSchema.parse({ publicLinkedPlatforms: ['luogu', 'luogu', 'leetcode'] }).publicLinkedPlatforms, ['luogu', 'leetcode']);
    assert.equal(profilePatchSchema.parse({ avatarUrl: '' }).avatarUrl, null);
});

test('email normalization is consistent and new passwords respect bcrypt byte boundaries', () => {
    assert.equal(emailSchema.parse('  USER@Example.Test '), 'user@example.test');
    assert.equal(emailSchema.safeParse({ email: 'user@example.test' }).success, false);
    assert.equal(newPasswordSchema.safeParse('x'.repeat(72)).success, true);
    assert.equal(newPasswordSchema.safeParse('x'.repeat(73)).success, false);
    assert.equal(newPasswordSchema.safeParse('中'.repeat(24)).success, true);
    assert.equal(newPasswordSchema.safeParse('中'.repeat(25)).success, false);
    assert.equal(newPasswordSchema.safeParse('short').success, false);
});
