import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { fsCache: false });
const { loadCaptchaScript } = await jiti.import('../utils/captcha-script.ts');

test('widget script loading is shared, bounded, and recovers from failed downloads', async t => {
    const previousDocument = globalThis.document;
    const scripts = [];
    globalThis.document = {
        createElement() {
            return {
                remove() {
                    this.removed = true;
                }
            };
        },
        head: {
            appendChild(script) {
                scripts.push(script);
            }
        }
    };
    t.mock.timers.enable({ apis: ['setTimeout'] });
    try {
        await loadCaptchaScript('already-ready', () => true);
        assert.equal(scripts.length, 0);

        let ready = false;
        const first = loadCaptchaScript('shared-script', () => ready);
        const second = loadCaptchaScript('shared-script', () => ready);
        assert.equal(first, second);
        assert.equal(scripts.length, 1);
        ready = true;
        scripts.at(-1).onload();
        await Promise.all([first, second]);

        const failed = loadCaptchaScript('retry-script', () => false);
        const rejected = assert.rejects(failed, /failed to load/);
        scripts.at(-1).onerror();
        await rejected;
        assert.equal(scripts.at(-1).removed, true);
        const retry = loadCaptchaScript('retry-script', () => true);
        await retry;

        ready = false;
        const retryDownload = loadCaptchaScript('retry-script', () => ready);
        assert.equal(scripts.length, 3);
        ready = true;
        scripts.at(-1).onload();
        await retryDownload;

        const missingApi = loadCaptchaScript('missing-api', () => false);
        const missingRejected = assert.rejects(missingApi, /did not initialize/);
        scripts.at(-1).onload();
        await missingRejected;

        const timeout = loadCaptchaScript('timeout-script', () => false);
        const timedOut = assert.rejects(timeout, /timed out/);
        t.mock.timers.tick(12_000);
        await timedOut;
        assert.equal(scripts.at(-1).removed, true);
        assert.equal(scripts.at(-1).onload, null);
    } finally {
        t.mock.timers.reset();
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});
