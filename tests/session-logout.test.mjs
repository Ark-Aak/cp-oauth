import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { fsCache: false });

/** Loads `useSession` with Nuxt auto-imports replaced by in-memory stubs. */
async function loadSession(logout) {
    const state = new Map();
    const navigations = [];
    Object.assign(globalThis, {
        useState: (key, init) => {
            if (!state.has(key)) state.set(key, { value: init() });
            return state.get(key);
        },
        computed: getter => ({
            get value() {
                return getter();
            }
        }),
        navigateTo: async target => {
            navigations.push(target);
        },
        useApi: () => async url => {
            assert.equal(url, '/api/auth/logout');
            return logout();
        },
        readApiError: () => ({ status: 0 })
    });
    const { useSession } = await jiti.import('../composables/useSession.ts');
    const session = useSession();
    session.setUser({ id: 'u1', username: 'alice' });
    return { session, navigations };
}

test('a failed logout keeps the signed-in user and stays on the page', async () => {
    const { session, navigations } = await loadSession(async () => {
        throw new TypeError('fetch failed');
    });
    await assert.rejects(session.signOut(), /fetch failed/);
    assert.equal(session.user.value?.id, 'u1');
    assert.deepEqual(navigations, []);
});

test('a confirmed logout forgets the user and leaves for the target', async () => {
    const { session, navigations } = await loadSession(async () => null);
    await session.signOut('/login?redirect=%2Fprofile');
    assert.equal(session.user.value, null);
    assert.deepEqual(navigations, ['/login?redirect=%2Fprofile']);
});
