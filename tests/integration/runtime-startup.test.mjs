import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const entry = fileURLToPath(new URL('../../.output/server/index.mjs', import.meta.url));
const database = new URL(process.env.DATABASE_URL || '');
if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
    !database.pathname.endsWith('_test')
) {
    throw new Error('Startup integration requires an explicit loopback _test database');
}
await access(entry);
const originalKey = Buffer.from(process.env.NUXT_DATA_ENCRYPTION_KEY || '', 'base64');
if (originalKey.length !== 32 || !process.env.NUXT_JWT_SECRET || !process.env.NUXT_REDIS_URL) {
    throw new Error('Startup integration requires complete isolated runtime configuration');
}

async function withServer(overrides, check) {
    const reservation = createServer();
    await new Promise((resolve, reject) => {
        reservation.once('error', reject);
        reservation.listen(0, '127.0.0.1', resolve);
    });
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const child = spawn(process.execPath, [entry], {
        cwd: root,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            NITRO_HOST: '127.0.0.1',
            NITRO_PORT: String(port),
            ...overrides
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', chunk => {
        output += chunk;
    });
    child.stderr.on('data', chunk => {
        output += chunk;
    });
    let closed = false;
    const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => {
            closed = true;
            resolve({ code, signal });
        });
    });
    let deadline;
    try {
        await Promise.race([
            check({
                uri: `http://127.0.0.1:${port}/api/readyz`,
                exited,
                output: () => output,
                closed: () => closed
            }),
            new Promise((_, reject) => {
                deadline = setTimeout(
                    () =>
                        reject(
                            new Error(`Built server did not finish its startup check:\n${output}`)
                        ),
                    10_000
                );
            })
        ]);
    } finally {
        closed = true;
        clearTimeout(deadline);
        if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
        }
        await exited.catch(() => {});
    }
}

async function assertRefused(overrides) {
    await withServer(overrides, async ({ uri, exited, output }) => {
        let stopped = false;
        let answeredReady = false;
        const observation = (async () => {
            while (!stopped) {
                try {
                    const response = await fetch(uri, { signal: AbortSignal.timeout(200) });
                    if (response.status === 200) answeredReady = true;
                } catch {
                    // Refused connections and aborted pending initialization are expected.
                }
                await delay(25);
            }
        })();
        try {
            const result = await exited;
            assert.equal(result.code, 1, output());
            assert.equal(result.signal, null, output());
        } finally {
            stopped = true;
            await observation;
        }
        assert.doesNotMatch(output(), /EADDRINUSE/);
        assert.equal(answeredReady, false, 'An invalid runtime must never return readyz 200');
    });
}

test(
    'built server exits for a missing signing key instead of accepting requests',
    {
        timeout: 15_000
    },
    async () => {
        await assertRefused({ NUXT_JWT_SECRET: '' });
    }
);

test(
    'built server exits when the data key cannot validate the migrated canary',
    {
        timeout: 15_000
    },
    async () => {
        const wrongKey = Buffer.from(originalKey);
        wrongKey[0] ^= 0xff;
        await assertRefused({ NUXT_DATA_ENCRYPTION_KEY: wrongKey.toString('base64') });
    }
);

test(
    'the same built server accepts the valid isolated runtime and returns readiness',
    {
        timeout: 15_000
    },
    async () => {
        await withServer({}, async ({ uri, output, closed }) => {
            while (!closed()) {
                let response;
                try {
                    response = await fetch(uri, { signal: AbortSignal.timeout(1000) });
                } catch {
                    await delay(25);
                    continue;
                }
                if (response.status === 200) {
                    assert.equal((await response.json()).status, 'ready', output());
                    return;
                }
                await delay(25);
            }
            assert.fail(`Valid runtime exited before readiness:\n${output()}`);
        });
    }
);
