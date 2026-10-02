import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { fsCache: false });
const {
    adminUsersQuerySchema,
    adminUserPatchSchema,
    noticeCreateSchema,
    showcaseCreateSchema
} = await jiti.import('../utils/admin-validation.ts');
const { parseInput } = await jiti.import('../server/utils/validation.ts');
const { sanitizeNoticeContent } = await jiti.import('../server/utils/notices.ts');

function rejects(schema, input, field) {
    assert.throws(() => parseInput(schema, input), error => {
        assert.equal(error.statusCode, 400);
        assert.equal(error.data.code, 'VALIDATION_ERROR');
        assert.equal(typeof error.data.fields[field], 'string');
        return true;
    });
}

test('administrator user writes reject privilege values, boolean coercion and empty patches', () => {
    for (const role of ['owner', '', 'constructor', null, {}, []]) {
        rejects(adminUserPatchSchema, { role }, 'role');
    }
    for (const emailVerified of ['true', 'false', 0, 1, null, {}, []]) {
        rejects(adminUserPatchSchema, { emailVerified }, 'emailVerified');
    }
    rejects(adminUserPatchSchema, {}, '_form');
    rejects(adminUserPatchSchema, { username: 'another_user' }, '_form');
    assert.deepEqual(adminUserPatchSchema.parse({ role: 'user', emailVerified: false }), {
        role: 'user', emailVerified: false
    });
});

test('administrator pagination and search enforce scalar bounded inputs', () => {
    assert.equal(adminUsersQuerySchema.parse({ page: '1' }).page, 1);
    assert.equal(adminUsersQuerySchema.parse({ page: '1000000' }).page, 1_000_000);
    for (const page of ['0', '-1', '1.5', '1e2', '1000001', '', 'NaN', ['1', '2'], 1, null]) {
        rejects(adminUsersQuerySchema, { page }, 'page');
    }
    assert.equal(adminUsersQuerySchema.parse({ search: 'x'.repeat(100) }).search, 'x'.repeat(100));
    for (const search of ['x'.repeat(101), ['alice', 'bob'], {}, 1]) {
        rejects(adminUsersQuerySchema, { search }, 'search');
    }
});

test('notices bound title characters and UTF-8 content without coercing pin state', () => {
    const title = 'x'.repeat(120);
    const content = '中'.repeat(21_845) + 'a';
    assert.equal(Buffer.byteLength(content), 65_536);
    const accepted = noticeCreateSchema.parse({ title, content, pinned: false });
    assert.equal(accepted.content, content);
    assert.equal(accepted.pinned, false);
    rejects(noticeCreateSchema, { title: title + 'x', content }, 'title');
    rejects(noticeCreateSchema, { title, content: content + 'a' }, 'content');
    rejects(noticeCreateSchema, { title: '   ', content }, 'title');
    rejects(noticeCreateSchema, { title, content: '\n   ' }, 'content');
    for (const pinned of ['false', 'true', 0, null, {}, []]) {
        rejects(noticeCreateSchema, { title, content, pinned }, 'pinned');
    }
    rejects(noticeCreateSchema, { title, content: {} }, 'content');
});

test('showcase accepts HTTP URLs and Int32 order boundaries but rejects unsafe and malformed values', () => {
    const base = {
        category: 'project', name: 'n'.repeat(120), description: 'd'.repeat(2000),
        url: 'https://example.test/project', iconUrl: 'http://example.test/icon.png'
    };
    for (const sortOrder of [-2_147_483_648, 2_147_483_647]) {
        assert.equal(showcaseCreateSchema.parse({ ...base, sortOrder }).sortOrder, sortOrder);
    }
    for (const sortOrder of [-2_147_483_649, 2_147_483_648, 1.2, '0', null]) {
        rejects(showcaseCreateSchema, { ...base, sortOrder }, 'sortOrder');
    }
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '/relative', 'https://user:pass@example.test', 'https://example.test/\\x', {}, []]) {
        rejects(showcaseCreateSchema, { ...base, url }, 'url');
        rejects(showcaseCreateSchema, { ...base, iconUrl: url }, 'iconUrl');
    }
    const origin = 'https://example.test/';
    const maxUrl = origin + 'x'.repeat(2048 - origin.length);
    assert.equal(showcaseCreateSchema.parse({ ...base, url: maxUrl }).url, maxUrl);
    rejects(showcaseCreateSchema, { ...base, url: maxUrl + 'x' }, 'url');
    rejects(showcaseCreateSchema, { ...base, iconUrl: maxUrl + 'x' }, 'iconUrl');
    rejects(showcaseCreateSchema, { ...base, name: 'n'.repeat(121) }, 'name');
    rejects(showcaseCreateSchema, { ...base, description: 'd'.repeat(2001) }, 'description');
    rejects(showcaseCreateSchema, { ...base, category: 'other' }, 'category');
    rejects(showcaseCreateSchema, { ...base, pinned: true }, '_form');
    assert.equal(showcaseCreateSchema.parse({ ...base, iconUrl: '' }).iconUrl, null);
});

test('notice sanitization preserves formatting and safe links without active HTML', () => {
    const rendered = sanitizeNoticeContent(
        '<p onclick="alert(1)"><strong>Formatted</strong>' +
        '<a href="https://example.test" target="_blank">Safe</a>' +
        '<a href="javascript:alert(1)">Unsafe</a>' +
        '<script>alert(1)</script><img src="x" onerror="alert(1)"></p>'
    );
    assert.match(rendered, /<strong>Formatted<\/strong>/);
    assert.match(rendered, /href="https:\/\/example\.test"/);
    assert.doesNotMatch(rendered, /javascript:|onclick|onerror|<script|<img/);
});
