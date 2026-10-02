import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { fsCache: false });
const {
    decodeDataEncryptionKey,
    decryptSecret,
    encryptSecret
} = await jiti.import('../server/utils/secrets.ts');
const key = new Uint8Array(randomBytes(32));
const context = 'SystemConfig:smtp_pass';

test('encrypts and authenticates separators, Unicode, and whitespace without changing content', () => {
    for (const value of ['password:with:separators', '竞赛🔐\nsecret', ' ']) {
        const encrypted = encryptSecret(value, context, key);
        assert.equal(decryptSecret(encrypted, context, key), value);
        assert.match(encrypted, /^enc:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/);
    }
});

test('uses independent IVs for repeated encryptions', () => {
    const first = encryptSecret('same secret', context, key);
    const second = encryptSecret('same secret', context, key);
    assert.notEqual(first.split(':')[2], second.split(':')[2]);
    assert.equal(decryptSecret(first, context, key), decryptSecret(second, context, key));
});

test('does not create an envelope for an empty value', () => {
    assert.equal(encryptSecret('', context, key), '');
    assert.equal(decryptSecret('', context, key), '');
});

test('authenticates key and row-specific AAD', () => {
    const encrypted = encryptSecret('protected', 'User:totpSecret:user-a', key);
    assert.throws(() => decryptSecret(encrypted, 'User:totpSecret:user-b', key));
    assert.throws(() => decryptSecret(encrypted, 'LinkedAccount:oauthAccessToken:user-a', key));
    assert.throws(() => decryptSecret(encrypted, 'User:totpSecret:user-a', randomBytes(32)));
});

for (const index of [2, 3, 4]) {
    test('rejects modified IV, tag, or ciphertext', () => {
        const parts = encryptSecret('protected', context, key).split(':');
        const bytes = Buffer.from(parts[index], 'base64url');
        bytes[0] ^= 1;
        parts[index] = bytes.toString('base64url');
        assert.throws(() => decryptSecret(parts.join(':'), context, key));
    });
}

for (const value of [
    'plaintext secret',
    'enc:v2:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AA',
    'enc:v1:AA:AAAAAAAAAAAAAAAAAAAAAA:AA',
    'enc:v1:AAAAAAAAAAAAAAAA:AA:AA',
    'enc:v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:',
    'enc:v1:AAAAAAAAAAAAAAA=:AAAAAAAAAAAAAAAAAAAAAA:AA',
    'enc:v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AA:extra',
    'enc:v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AB'
]) {
    test('rejects plaintext and malformed envelopes without a fallback', () => {
        assert.throws(() => decryptSecret(value, context, key));
    });
}

for (const invalidKey of [new Uint8Array(31), new Uint8Array(33), 'not bytes', null]) {
    test('rejects invalid key material even when the secret is empty', () => {
        assert.throws(() => encryptSecret('', context, invalidKey));
        assert.throws(() => decryptSecret('', context, invalidKey));
    });
}

test('requires string values and non-empty AAD', () => {
    assert.throws(() => encryptSecret(null, context, key));
    assert.throws(() => decryptSecret(null, context, key));
    assert.throws(() => encryptSecret('secret', '', key));
    assert.throws(() => decryptSecret('secret', '', key));
});

test('decodes canonical padded or unpadded base64 keys only', () => {
    const encoded = Buffer.from(key).toString('base64');
    assert.deepEqual(decodeDataEncryptionKey(encoded), Buffer.from(key));
    assert.deepEqual(decodeDataEncryptionKey(encoded.replace(/=+$/, '')), Buffer.from(key));
    for (const invalid of [
        '',
        Buffer.alloc(31).toString('base64'),
        Buffer.alloc(33).toString('base64'),
        `${encoded}\n`,
        encoded.replace(/=+$/, '==='),
        'A'.repeat(42) + 'B='
    ]) {
        assert.throws(() => decodeDataEncryptionKey(invalid));
    }
});
