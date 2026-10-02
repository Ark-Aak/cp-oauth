import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createError } from 'h3';
import { createJiti } from 'jiti';
import { ofetch } from 'ofetch';

const jiti = createJiti(import.meta.url, {
    alias: { '~': fileURLToPath(new URL('../', import.meta.url)) },
    fsCache: false
});
const { fetchLuoguPaste } = await jiti.import('../server/utils/luogu-paste.ts');
const { luoguVerifier } = await jiti.import('../server/utils/platforms/luogu.ts');

const originalFetch = globalThis.$fetch;
const originalCreateError = globalThis.createError;
const pasteId = '8z284hnx';
const platformUid = '1190893';
const code = 'CPOAUTH-CHALLENGE-42BA9296';
let response;
let fetchMock;

beforeEach(() => {
    response = {
        instance: 'main',
        template: 'paste.show',
        status: 200,
        locale: 'zh-CN',
        data: {
            paste: {
                id: pasteId,
                user: { uid: Number(platformUid), name: 'quanac_lcx' },
                time: 1790253084,
                public: true,
                updateAt: 1790253084,
                data: code
            },
            canEdit: false
        },
        // The signed-in viewer must never be used as the paste owner.
        user: { uid: 42, name: 'viewer' },
        time: 1790304201.727219
    };
    fetchMock = mock.fn(async () => Response.json(response));
    globalThis.$fetch = ofetch.create({ retry: 0 }, { fetch: fetchMock });
    globalThis.createError = createError;
});

afterEach(() => {
    globalThis.$fetch = originalFetch;
    globalThis.createError = originalCreateError;
    mock.restoreAll();
});

test('fetches the updated paste endpoint and reads content and ownership from data.paste', async () => {
    assert.deepEqual(await fetchLuoguPaste(` ${pasteId} `), {
        id: pasteId,
        data: code,
        isPublic: true,
        ownerUid: platformUid,
        ownerUsername: 'quanac_lcx'
    });

});

test('does not fetch an empty paste ID', async () => {
    assert.equal(await fetchLuoguPaste('   '), null);
    assert.equal(fetchMock.mock.callCount(), 0);
});

for (const input of [
    `https://www.luogu.com.cn/paste/${pasteId}`,
    `https://www.luogu.com/paste/${pasteId}`,
    `https://luogu.com.cn/paste/${pasteId}`,
    `https://luogu.com/paste/${pasteId}`,
    `http://www.luogu.com.cn/paste/${pasteId}`,
    `http://www.luogu.com/paste/${pasteId}`,
    `https://www.luogu.com.cn/paste/${pasteId}/`,
    `https://www.luogu.com.cn/paste/${pasteId}?source=share#content`,
    `https://www.luogu.com/paste/${pasteId}/?source=share#content`,
    `  https://www.luogu.com.cn/paste/${pasteId}  `,
    `https://WWW.LUOGU.COM.CN/paste/${pasteId}`
]) {
    test(`accepts the paste URL ${input.trim()}`, async () => {
        const paste = await fetchLuoguPaste(input);
        assert.equal(paste.id, pasteId);
        assert.equal(paste.data, code);
        assert.equal(paste.ownerUid, platformUid);
    });
}

for (const input of [
    'not a paste ID',
    '../user/1190893',
    `${pasteId}?source=share`,
    `https://example.com/paste/${pasteId}`,
    `https://www.luogu.com.cn.example.com/paste/${pasteId}`,
    `https://www.luogu.com.cn@evil.example/paste/${pasteId}`,
    `https://evil.example@www.luogu.com.cn/paste/${pasteId}`,
    `https://www.luogu.com.cn:8080/paste/${pasteId}`,
    `ftp://www.luogu.com.cn/paste/${pasteId}`,
    `https://www.luogu.com.cn/user/${platformUid}`,
    'https://www.luogu.com.cn/paste/',
    `https://www.luogu.com.cn/paste/${pasteId}/edit`,
    `https://www.luogu.com.cn/paste/${pasteId}%2Fedit`
]) {
    test(`rejects invalid paste input without a network request: ${input}`, async () => {
        await assert.rejects(fetchLuoguPaste(input), { statusCode: 400 });
        assert.equal(fetchMock.mock.callCount(), 0);
    });
}

test('returns null when the response has no paste', async () => {
    response.data = {};
    assert.equal(await fetchLuoguPaste(pasteId), null);
});

test('returns null when Luogu responds with HTTP 404', async () => {
    fetchMock.mock.mockImplementation(async () => new Response(null, { status: 404 }));
    assert.equal(await fetchLuoguPaste(pasteId), null);
});

for (const status of [403, 429, 500]) {
    test(`reports an upstream failure when Luogu responds with HTTP ${status}`, async () => {
        fetchMock.mock.mockImplementation(async () => new Response(null, { status }));
        await assert.rejects(fetchLuoguPaste(pasteId), { statusCode: 502 });
    });
}

test('reports an upstream failure when the request fails', async () => {
    fetchMock.mock.mockImplementation(async () => {
        throw new Error('Network unavailable');
    });
    await assert.rejects(fetchLuoguPaste(pasteId), { statusCode: 502 });
});

test('verifies the challenge using the new response and the paste owner', async () => {
    assert.deepEqual(await luoguVerifier.verify({ platformUid, code, credential: pasteId }), {
        success: true,
        platformUid,
        platformUsername: 'quanac_lcx'
    });
});

for (const host of ['www.luogu.com.cn', 'www.luogu.com']) {
    test(`accepts ${host} paste URLs in the verifier shared by login, registration and linking`, async () => {
        const result = await luoguVerifier.verify({
            platformUid,
            code,
            credential: `https://${host}/paste/${pasteId}?source=share#content`
        });
        assert.deepEqual(result, {
            success: true,
            platformUid,
            platformUsername: 'quanac_lcx'
        });
    });
}

test('rejects invalid paste URLs in the shared verifier without fetching', async () => {
    const result = await luoguVerifier.verify({
        platformUid, code, credential: `https://example.com/paste/${pasteId}`
    });
    assert.equal(result.success, false);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test('rejects a private paste even if its challenge is correct', async () => {
    response.data.paste.public = false;
    const result = await luoguVerifier.verify({ platformUid, code, credential: pasteId });
    assert.equal(result.success, false);
});

test('rejects the viewer UID when it differs from the paste owner UID', async () => {
    const viewerUid = String(response.user.uid);
    const result = await luoguVerifier.verify({ platformUid: viewerUid, code, credential: pasteId });
    assert.equal(result.success, false);
});

test('rejects a paste that does not contain the requested challenge', async () => {
    response.data.paste.data = 'CPOAUTH-CHALLENGE-WRONG';
    const result = await luoguVerifier.verify({ platformUid, code, credential: pasteId });
    assert.equal(result.success, false);
});

test('does not disguise an upstream verification failure as an incorrect paste', async () => {
    fetchMock.mock.mockImplementation(async () => new Response(null, { status: 500 }));
    await assert.rejects(luoguVerifier.verify({ platformUid, code, credential: pasteId }), { statusCode: 502 });
});
