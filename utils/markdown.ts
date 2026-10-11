import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeShiki from '@shikijs/rehype';
import rehypeStringify from 'rehype-stringify';

type MarkdownNode = {
    type: string;
    depth?: number;
    children?: MarkdownNode[];
    position?: { start: { offset?: number } };
};

function demoteEmbeddedHeadings() {
    return (tree: MarkdownNode) => {
        const visit = (node: MarkdownNode) => {
            if (node.type === 'heading' && typeof node.depth === 'number') {
                node.depth = Math.min(6, node.depth + 1);
            }
            if (node.children) for (const child of node.children) visit(child);
        };
        visit(tree);
    };
}

/* GFM turns bare URLs into links; only `[text](url)` and `<url>` syntax should link here. */
function unwrapLiteralAutolinks() {
    return (tree: MarkdownNode, file: { value: unknown }) => {
        const source = String(file.value);
        const visit = (node: MarkdownNode) => {
            if (!node.children) return;
            node.children = node.children.flatMap(child => {
                const offset = child.position?.start.offset;
                if (
                    child.type === 'link' &&
                    offset !== undefined &&
                    !'[<'.includes(source[offset]!)
                ) {
                    return child.children ?? [];
                }
                visit(child);
                return [child];
            });
        };
        visit(tree);
    };
}

const forbiddenAttributes: Record<string, true> = { style: true, id: true, name: true };
const sanitizeSchema = {
    ...defaultSchema,
    attributes: Object.fromEntries(
        Object.entries(defaultSchema.attributes || {}).map(([tag, attributes]) => [
            tag,
            (attributes || []).filter(
                attribute =>
                    !Object.hasOwn(
                        forbiddenAttributes,
                        typeof attribute === 'string' ? attribute : attribute[0]
                    )
            )
        ])
    ),
    protocols: {
        ...defaultSchema.protocols,
        href: ['http', 'https', 'mailto'],
        src: ['http', 'https']
    }
};

function createProcessor(autolinkLiterals: boolean) {
    const base = unified().use(remarkParse).use(remarkGfm).use(demoteEmbeddedHeadings);
    return (autolinkLiterals ? base : base.use(unwrapLiteralAutolinks))
        .use(remarkRehype, { allowDangerousHtml: false })
        .use(rehypeSanitize, sanitizeSchema)
        .use(rehypeShiki, {
            themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
            defaultColor: false
        })
        .use(rehypeStringify);
}

const processors = { linked: createProcessor(true), plain: createProcessor(false) };

export async function renderMarkdown(
    markdown: string,
    options: { autolinkLiterals?: boolean } = {}
): Promise<string> {
    const processor = options.autolinkLiterals === false ? processors.plain : processors.linked;
    const result = await processor.process(markdown);
    return String(result);
}
