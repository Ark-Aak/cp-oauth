import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { ofetch } from 'ofetch';

const jiti = createJiti(import.meta.url, {
    alias: { '~': fileURLToPath(new URL('../', import.meta.url)) },
    fsCache: false
});
const { captchaProviders, normalizeCapUrl, capEndpoint, capScriptUrl, capWasmUrls } =
    await jiti.import('../utils/captcha.ts');
const { verifyConfiguredCaptcha } = await jiti.import('../server/utils/captcha-verification.ts');
const config = {
    turnstileEnabled: true,
    capEnabled: true,
    captchaPreferredProvider: 'turnstile',
    captchaAutoFailover: true,
    turnstileSecretKey: 'turnstile-private',
    capInstanceUrl: 'https://cap.example.test',
    capSiteKey: 'site-key',
    capSecretKey: 'cap-private'
};

test('provider policy covers off, either single provider, preferred order and disabled failover', () => {
    assert.deepEqual(
        captchaProviders({ ...config, turnstileEnabled: false, capEnabled: false }),
        []
    );
    assert.deepEqual(captchaProviders({ ...config, turnstileEnabled: false }), ['cap']);
    assert.deepEqual(
        captchaProviders({ ...config, capEnabled: false, captchaPreferredProvider: 'cap' }),
        ['turnstile']
    );
    assert.deepEqual(captchaProviders(config), ['turnstile', 'cap']);
    assert.deepEqual(captchaProviders({ ...config, captchaPreferredProvider: 'cap' }), [
        'cap',
        'turnstile'
    ]);
    assert.deepEqual(captchaProviders({ ...config, captchaAutoFailover: false }), ['turnstile']);
});

test('CAP URL validation and asset sources preserve instance paths and encode keys', () => {
    assert.equal(
        capEndpoint('https://cap.example.test/prefix/', 'key/next'),
        'https://cap.example.test/prefix/key%2Fnext/'
    );
    assert.equal(normalizeCapUrl('http://127.0.0.1:4000/'), 'http://127.0.0.1:4000');
    for (const url of [
        'http://external.example',
        'javascript:alert(1)',
        'https://user:pass@cap.test',
        'https://cap.test/?secret=x',
        'https://cap.test/#x'
    ]) {
        assert.throws(() => normalizeCapUrl(url));
    }
    assert.equal(
        capScriptUrl('self-hosted', 'https://cap.test/prefix/'),
        'https://cap.test/prefix/assets/widget.js'
    );
    assert.match(capScriptUrl('jsdelivr', ''), /^https:\/\/cdn\.jsdelivr\.net\/npm\/cap-widget@\d/);
    assert.match(capScriptUrl('unpkg', ''), /^https:\/\/unpkg\.com\/cap-widget@\d/);
    assert.equal(
        capWasmUrls('self-hosted', 'https://cap.test/').wasm,
        'https://cap.test/assets/cap_wasm_bg.wasm'
    );
    assert.match(capWasmUrls('unpkg', '').hashwx, /^https:\/\/unpkg\.com\/@cap.js\/wasm@0.0.8/);
});

test('verification enforces provider policy, real HTTP failures, secrets and Turnstile context', async t => {
    let status = 200;
    let result = { success: true, hostname: 'oauth.test', action: 'login' };
    const calls = [];
    const server = createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        calls.at(-1).body = JSON.parse(body);
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(typeof result === 'string' ? result : JSON.stringify(result));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const fetcher = ofetch.create({
        onRequest(context) {
            calls.push({ url: String(context.request) });
            context.request = `http://127.0.0.1:${server.address().port}/verify`;
        }
    });
    const verify = (token, settings = config) =>
        verifyConfiguredCaptcha(settings, { token, action: 'login' }, 'oauth.test', fetcher);
    try {
        await t.test('both off requires no proof; enabled requires proof', async () => {
            await verify(undefined, { ...config, turnstileEnabled: false, capEnabled: false });
            await assert.rejects(verify(undefined), { statusCode: 400 });
            assert.equal(calls.length, 0);
        });
        await t.test(
            'legacy Turnstile and CAP tokens reach only their own endpoints and secrets',
            async () => {
                await verify('turnstile-token');
                assert.equal(
                    calls.at(-1).url,
                    'https://challenges.cloudflare.com/turnstile/v0/siteverify'
                );
                assert.deepEqual(calls.at(-1).body, {
                    secret: 'turnstile-private',
                    response: 'turnstile-token'
                });
                result = { success: true };
                await verify('cap:cap-token');
                assert.equal(calls.at(-1).url, 'https://cap.example.test/site-key/siteverify');
                assert.deepEqual(calls.at(-1).body, {
                    secret: 'cap-private',
                    response: 'cap-token'
                });
            }
        );
        await t.test(
            'disabled and nonpreferred providers are rejected before upstream requests',
            async () => {
                const before = calls.length;
                await assert.rejects(verify('cap:x', { ...config, capEnabled: false }), {
                    statusCode: 400
                });
                await assert.rejects(verify('cap:x', { ...config, captchaAutoFailover: false }), {
                    statusCode: 400
                });
                await assert.rejects(
                    verify('turnstile-token', {
                        ...config,
                        captchaPreferredProvider: 'cap',
                        captchaAutoFailover: false
                    }),
                    { statusCode: 400 }
                );
                assert.equal(calls.length, before);
                await verify('cap:x', {
                    ...config,
                    turnstileEnabled: false,
                    captchaAutoFailover: false
                });
            }
        );
        await t.test(
            'wrong host/action and rejected CAP proofs fail without suggesting failover',
            async () => {
                for (const value of [
                    { success: true, hostname: 'attacker.test', action: 'login' },
                    { success: true, hostname: 'oauth.test', action: 'register' },
                    { success: false }
                ]) {
                    result = value;
                    await assert.rejects(verify('turnstile-token'), { statusCode: 400 });
                }
                status = 400;
                await assert.rejects(
                    verify('cap:invalid'),
                    error => error.statusCode === 400 && !error.data?.fallbackProvider
                );
                result = { success: true };
                status = 401;
                await assert.rejects(verify('cap:invalid'), { statusCode: 400 });
            }
        );
        await t.test(
            'outages request a fresh proof from the enabled alternative; never silently succeed',
            async () => {
                for (const value of [500, 503, 429]) {
                    status = value;
                    await assert.rejects(
                        verify('cap:x'),
                        error =>
                            error.statusCode === 502 && error.data.fallbackProvider === 'turnstile'
                    );
                    await assert.rejects(
                        verify('turnstile-token'),
                        error => error.statusCode === 502 && error.data.fallbackProvider === 'cap'
                    );
                }
                await assert.rejects(
                    verify('turnstile-token', { ...config, captchaAutoFailover: false }),
                    error => error.statusCode === 502 && !error.data.fallbackProvider
                );
                status = 200;
                result = { success: false, 'error-codes': ['internal-error'] };
                await assert.rejects(verify('turnstile-token'), { statusCode: 502 });
                result = '<html>broken proxy</html>';
                await assert.rejects(verify('cap:x'), { statusCode: 502 });
                await assert.rejects(
                    verifyConfiguredCaptcha(
                        config,
                        { token: 'cap:x', action: 'login' },
                        'oauth.test',
                        async () => {
                            throw new Error('network down');
                        }
                    ),
                    { statusCode: 502 }
                );
            }
        );
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
