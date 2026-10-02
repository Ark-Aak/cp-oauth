import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiti } from 'jiti';
import sanitizeHtml from 'sanitize-html';

const jiti = createJiti(import.meta.url, { fsCache: false });
const { renderMarkdown } = await jiti.import('../utils/markdown.ts');

function parseElements(html) {
    const elements = [];
    sanitizeHtml(html, {
        // Inspect parsed attributes before sanitize-html changes them.
        onOpenTag(tag, attributes) {
            elements.push({ tag, attributes: { ...attributes } });
        }
    });
    return elements;
}

test('removes unsafe link protocols without removing their readable labels', async () => {
    const html = await renderMarkdown([
        '[javascript](javascript:alert%281%29)',
        '[mixed case](JaVaScRiPt:alert%281%29)',
        '[entity](javascript&#58;alert%281%29)',
        '[data](data:text/html;base64,PHNjcmlwdD4=)',
        '[unsupported](ftp://example.test/file)'
    ].join('\n\n'));

    for (const { attributes } of parseElements(html)) {
        assert.equal(attributes.href, undefined);
    }
    for (const label of ['javascript', 'mixed case', 'entity', 'data', 'unsupported']) {
        assert.ok(html.includes(label), `preserves the ${label} label`);
    }
});

test('removes data and non-image protocols from image sources', async () => {
    const html = await renderMarkdown([
        '![data image](data:image/svg+xml;base64,PHN2Zz4=)',
        '![javascript image](javascript:alert%281%29)',
        '![mail image](mailto:person@example.test)'
    ].join('\n\n'));
    const images = parseElements(html).filter(element => element.tag === 'img');

    assert.deepEqual(
        images.map(({ attributes }) => ({ alt: attributes.alt, src: attributes.src })),
        [
            { alt: 'data image', src: undefined },
            { alt: 'javascript image', src: undefined },
            { alt: 'mail image', src: undefined }
        ]
    );
});

test('does not turn raw HTML, event handlers or user styles into DOM attributes', async () => {
    const html = await renderMarkdown([
        '<script>alert(1)</script>',
        '<style>body { display: none }</style>',
        '<iframe src="https://example.test"></iframe>',
        '<img src="https://example.test/image.png" onerror="alert(1)">',
        '<span style="color:red" id="location" name="location" onclick="alert(1)">Readable text</span>'
    ].join('\n\n'));
    const elements = parseElements(html);

    assert.equal(
        elements.some(({ tag }) => ['script', 'style', 'iframe', 'img', 'span'].includes(tag)),
        false
    );
    for (const { attributes } of elements) {
        for (const name of Object.keys(attributes)) {
            assert.doesNotMatch(name, /^(?:on|style$|id$|name$)/i);
        }
    }
    assert.match(html, /Readable text/);
});

test('embedded headings preserve hierarchy without creating another page h1', async () => {
    const elements = parseElements(await renderMarkdown('# Title\n\n## Section\n\n###### Detail'));
    assert.deepEqual(elements.filter(({ tag }) => /^h[1-6]$/.test(tag)).map(({ tag }) => tag), ['h2', 'h3', 'h6']);
});

test('preserves safe links, images, GFM and escaped highlighted code', async () => {
    const html = await renderMarkdown([
        '[relative](/guide?mode=pkce#example)',
        '[http](http://localhost/guide)',
        '[https](https://example.test/guide)',
        '[email](mailto:person@example.test)',
        '![relative image](/avatar.png)',
        '![https image](https://example.test/avatar.png)',
        '| Platform | Status |\n| --- | --- |\n| Luogu | Linked |',
        '- [x] Verified\n- [ ] Pending',
        '~~revoked~~',
        '```javascript\nconst literal = "<img src=x onerror=alert(1)>";\n```'
    ].join('\n\n'));
    const elements = parseElements(html);

    assert.deepEqual(
        elements.filter(({ tag }) => tag === 'a').map(({ attributes }) => attributes.href),
        [
            '/guide?mode=pkce#example',
            'http://localhost/guide',
            'https://example.test/guide',
            'mailto:person@example.test'
        ]
    );
    assert.deepEqual(
        elements.filter(({ tag }) => tag === 'img').map(({ attributes }) => attributes.src),
        ['/avatar.png', 'https://example.test/avatar.png']
    );
    assert.match(html, /<table>[\s\S]*<th>Platform<\/th>[\s\S]*<td>Luogu<\/td>/);
    assert.match(html, /<del>revoked<\/del>/);
    assert.deepEqual(
        elements.filter(({ tag }) => tag === 'input').map(({ attributes }) => ({
            type: attributes.type,
            disabled: Object.hasOwn(attributes, 'disabled'),
            checked: Object.hasOwn(attributes, 'checked')
        })),
        [
            { type: 'checkbox', disabled: true, checked: true },
            { type: 'checkbox', disabled: true, checked: false }
        ]
    );
    const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
    assert.ok(text.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(elements.some(({ tag, attributes }) =>
        tag === 'span' &&
        attributes.style?.includes('--shiki-light:') &&
        attributes.style.includes('--shiki-dark:')
    ));
});
