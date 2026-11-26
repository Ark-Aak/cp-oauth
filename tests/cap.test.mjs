import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { generateChallenge, hashwxHash, hashwxReady, hashwxSeed, hashwxTarget } from 'capjs-core';

const jiti = createJiti(import.meta.url, {
    alias: { '~': fileURLToPath(new URL('..', import.meta.url)) },
    fsCache: false
});
const { CAP_SCOPES, deriveCapTokenKey, parseCapScope, redeemCapChallenge } =
    await jiti.import('../server/utils/cap.ts');

test('parseCapScope accepts allowlisted scopes and rejects unknown ones', () => {
    for (const scope of CAP_SCOPES) {
        assert.equal(parseCapScope(scope), scope);
    }
    for (const bad of ['', 'admin', 'login/extra', '__proto__', null, 123]) {
        assert.throws(() => parseCapScope(bad), { statusCode: 404 });
    }
});

test('deriveCapTokenKey matches capjs-core format and rejects malformed tokens', () => {
    const id = 'a1b2c3d4e5f60718';
    const secret = '0123456789abcdef0123456789abcd';
    const expected = `${id}:${createHash('sha256').update(secret).digest('hex')}`;
    assert.equal(deriveCapTokenKey(`${id}:${secret}`), expected);
    assert.equal(deriveCapTokenKey(`  ${id}:${secret}  `), expected);

    for (const bad of ['', ':', 'abc:', ':def', 'a:b:c', 'not-hex:1234', '1234:xyz!']) {
        assert.equal(deriveCapTokenKey(bad), null);
    }
});

test('redeemCapChallenge enforces HashWX PoW, single-use nonce, scope binding, and token key derivation', async () => {
    const secret = randomBytes(32).toString('hex');
    const challenge = await generateChallenge(secret, {
        scope: 'login',
        format: 2,
        protocols: ['hashwx'],
        hashwxDifficulty: 64,
        hashwxChallengeCount: 2
    });
    assert.equal(challenge.format, 2);

    const state = await hashwxReady();
    const solutions = challenge.challenges.map(entry => {
        const challengeBytes = Buffer.from(entry.payload.c, 'hex');
        const target = hashwxTarget(entry.payload.d);
        const noncesPerHash = BigInt(entry.payload.n);
        let nonce = 0n;
        while (true) {
            const block = nonce / noncesPerHash;
            const seed = hashwxSeed(challengeBytes, block);
            const h = hashwxHash(state, seed, nonce);
            if (h <= target) return { nonce: Number(nonce) };
            nonce += 1n;
        }
    });

    const usedNonces = new Set();
    const storedTokens = new Map();
    const consumeNonce = sig => {
        if (usedNonces.has(sig)) return false;
        usedNonces.add(sig);
        return true;
    };
    const storeToken = async (scope, tokenKey, expires) => {
        storedTokens.set(`${scope}:${tokenKey}`, expires);
    };

    // Wrong scope must fail without consuming nonce
    const wrongScope = await redeemCapChallenge(
        'register',
        { token: challenge.token, solutions },
        { secret, consumeNonce, storeToken }
    );
    assert.equal(wrongScope.success, false);
    assert.equal(usedNonces.size, 0);

    // Valid redeem succeeds and stores the exact re-derived token key
    const valid = await redeemCapChallenge(
        'login',
        { token: challenge.token, solutions },
        { secret, consumeNonce, storeToken }
    );
    assert.equal(valid.success, true);
    assert.ok(valid.token);
    const derivedKey = deriveCapTokenKey(valid.token);
    assert.ok(derivedKey);
    assert.equal(storedTokens.get(`login:${derivedKey}`), valid.expires);

    // Replaying the same solved challenge must fail via consumeNonce
    const replay = await redeemCapChallenge(
        'login',
        { token: challenge.token, solutions },
        { secret, consumeNonce, storeToken }
    );
    assert.equal(replay.success, false);
});
