import type { Element, Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import type { HighlighterCore } from 'shiki/core';
import rehypeShikiFromHighlighter, { type RehypeShikiCoreOptions } from '@shikijs/rehype/core';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export interface RenderMarkdownOptions {
    /** Turn bare URLs and e-mail addresses into links (GFM literal autolinks). */
    autolinkLiterals?: boolean;
}

const LINK_PROTOCOLS = ['http', 'https', 'mailto'];
const IMAGE_PROTOCOLS = ['http', 'https'];

/**
 * GitHub-style allowlist without raw-HTML carriers. Relative URLs pass; any explicit
 * protocol must be on the list, so `javascript:` and `data:` lose their attribute.
 */
const schema = {
    ...defaultSchema,
    clobberPrefix: '',
    clobber: [],
    tagNames: (defaultSchema.tagNames ?? []).filter(
        tag => !['span', 'iframe', 'script', 'style'].includes(tag)
    ),
    attributes: {
        ...defaultSchema.attributes,
        '*': (defaultSchema.attributes?.['*'] ?? []).filter(
            attribute =>
                typeof attribute !== 'string' || !['id', 'name', 'style'].includes(attribute)
        )
    },
    protocols: {
        ...defaultSchema.protocols,
        href: LINK_PROTOCOLS,
        src: IMAGE_PROTOCOLS,
        cite: IMAGE_PROTOCOLS,
        longDesc: IMAGE_PROTOCOLS
    }
};

const LANGUAGE_ALIASES: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    'c++': 'cpp',
    cc: 'cpp',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    shellscript: 'bash',
    yml: 'yaml'
};

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
    highlighter ??= createHighlighterCore({
        themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
        langs: [
            import('shiki/langs/cpp.mjs'),
            import('shiki/langs/c.mjs'),
            import('shiki/langs/python.mjs'),
            import('shiki/langs/java.mjs'),
            import('shiki/langs/javascript.mjs'),
            import('shiki/langs/typescript.mjs'),
            import('shiki/langs/rust.mjs'),
            import('shiki/langs/go.mjs'),
            import('shiki/langs/json.mjs'),
            import('shiki/langs/yaml.mjs'),
            import('shiki/langs/bash.mjs'),
            import('shiki/langs/diff.mjs')
        ],
        engine: createJavaScriptRegexEngine()
    });
    return highlighter;
}

/** Removes GFM literal autolinks, which carry no source brackets, while keeping their text. */
function remarkDropLiteralAutolinks() {
    return (tree: MdastRoot, file: { value: unknown }) => {
        const source = String(file.value);
        visit(tree, 'link', (node, index, parent) => {
            if (!parent || index === undefined || !node.position) return;
            const start = node.position.start.offset;
            if (start === undefined) return;
            const opener = source[start];
            if (opener === '[' || opener === '<') return;
            parent.children.splice(index, 1, ...node.children);
            return index;
        });
    };
}

/** The page owns its h1: shift every embedded heading down one level. */
function rehypeDemoteHeadings() {
    return (tree: HastRoot) => {
        visit(tree, 'element', (node: Element) => {
            const match = /^h([1-6])$/.exec(node.tagName);
            if (!match) return;
            const level = Number(match[1]);
            if (level < 6) node.tagName = `h${level + 1}`;
        });
    };
}

function normalizeLanguage(tree: HastRoot) {
    visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'code' || !Array.isArray(node.properties?.className)) return;
        node.properties.className = node.properties.className.map(name => {
            const value = String(name);
            if (!value.startsWith('language-')) return value;
            const language = value.slice('language-'.length).toLowerCase();
            return `language-${LANGUAGE_ALIASES[language] ?? language}`;
        });
    });
}

const SHIKI_OPTIONS: RehypeShikiCoreOptions = {
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    fallbackLanguage: 'text',
    onError: () => {}
};

export async function renderMarkdown(
    source: string,
    options: RenderMarkdownOptions = {}
): Promise<string> {
    const autolinkLiterals = options.autolinkLiterals ?? true;
    const highlighter = await getHighlighter();
    const processor = unified().use(remarkParse).use(remarkGfm);
    if (!autolinkLiterals) processor.use(remarkDropLiteralAutolinks);
    const file = await processor
        .use(remarkRehype)
        .use(rehypeSanitize, schema)
        .use(rehypeDemoteHeadings)
        .use(() => normalizeLanguage)
        .use(() =>
            // HighlighterCore is HighlighterGeneric<never, never>; the plugin is typed for any language set.
            rehypeShikiFromHighlighter(
                highlighter as unknown as Parameters<typeof rehypeShikiFromHighlighter>[0],
                SHIKI_OPTIONS
            )
        )
        .use(rehypeStringify)
        .process(source);
    return String(file);
}
