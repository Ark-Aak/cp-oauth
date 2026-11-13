import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '~': fileURLToPath(new URL('../', import.meta.url)) },
    fsCache: false
});
const { linkedAvatarSuggestion } = await jiti.import('../utils/linked-avatar.ts');
const { useLinkedAvatar } = await jiti.import('../composables/useLinkedAvatar.ts');
const { useAuthFlow } = await jiti.import('../composables/useAuthFlow.ts');
const names = [
    'useState',
    'useSession',
    'usePreferences',
    'useReauth',
    'useLinkedAvatar',
    'getSafeRedirectTarget',
    'navigateTo'
];
const saved = new Map(names.map(name => [name, globalThis[name]]));
afterEach(() => {
    for (const [name, value] of saved) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
    }
});

test('Luogu candidates use the verified numeric UID and GitHub candidates use its returned image', () => {
    assert.deepEqual(linkedAvatarSuggestion('luogu', '123456'), {
        provider: 'luogu',
        avatarUrl: 'https://cdn.luogu.com.cn/upload/usericon/123456.png'
    });
    assert.equal(linkedAvatarSuggestion('luogu', '../another-user'), null);
    assert.equal(linkedAvatarSuggestion('luogu', ''), null);
    const avatarUrl = 'https://avatars.githubusercontent.com/u/42?v=4';
    assert.deepEqual(linkedAvatarSuggestion('github', '42', avatarUrl), {
        provider: 'github',
        avatarUrl
    });
    for (const image of [
        null,
        '',
        'javascript:alert(1)',
        'https://user:pass@example.com/photo.png'
    ]) {
        assert.equal(linkedAvatarSuggestion('github', '42', image), null);
    }
    assert.equal(linkedAvatarSuggestion('google', '42', avatarUrl), null);
});

test('offers preserve old and new images without updating the user, and omit a missing old image', () => {
    const user = { value: { id: 'user-1', avatarUrl: null } };
    const state = new Map();
    globalThis.useSession = () => ({ user });
    globalThis.useState = (key, init) => {
        if (!state.has(key)) state.set(key, { value: init() });
        return state.get(key);
    };
    const dialog = useLinkedAvatar();
    const suggestion = linkedAvatarSuggestion('luogu', '123456');
    dialog.offer(suggestion);
    assert.equal(dialog.pending.value.previousUrl, null);
    assert.equal(dialog.pending.value.avatarUrl, suggestion.avatarUrl);
    assert.equal(user.value.avatarUrl, null);
    dialog.pending.value = null; // Dismissing the offer does not change the account.
    assert.equal(user.value.avatarUrl, null);
    user.value.avatarUrl = 'https://images.example/old.png';
    dialog.offer(suggestion);
    assert.equal(dialog.pending.value.previousUrl, user.value.avatarUrl);
    dialog.pending.value = null;
    user.value.avatarUrl = suggestion.avatarUrl;
    dialog.offer(suggestion);
    assert.equal(dialog.pending.value, null);
    user.value = null;
    dialog.offer(suggestion);
    assert.equal(dialog.pending.value, null);
});

test('GitHub binding refreshes the rotated session before offering the avatar and returning', async () => {
    const events = [];
    globalThis.useSession = () => ({
        refresh: async () => {
            events.push('refresh');
        }
    });
    globalThis.usePreferences = () => ({
        applyAccount: async () => {
            events.push('preferences');
        }
    });
    globalThis.useReauth = () => ({
        storeProof: () => {
            events.push('proof');
        }
    });
    globalThis.useLinkedAvatar = () => ({
        offer: suggestion => {
            events.push(suggestion);
        }
    });
    globalThis.getSafeRedirectTarget = (target, fallback) => target || fallback;
    globalThis.navigateTo = async target => {
        events.push(target);
    };
    const suggestion = linkedAvatarSuggestion(
        'github',
        '42',
        'https://avatars.githubusercontent.com/u/42'
    );
    await useAuthFlow().complete({
        bound: true,
        redirect: '/profile?tab=bindings',
        avatarSuggestion: suggestion
    });
    assert.deepEqual(events, ['refresh', suggestion, '/profile?tab=bindings']);
    events.length = 0;
    await useAuthFlow().complete({ authenticated: true, redirect: '/profile' });
    assert.deepEqual(events, ['refresh', 'preferences', '/profile']);
});
