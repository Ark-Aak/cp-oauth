import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeShiki from '@shikijs/rehype';
import rehypeStringify from 'rehype-stringify';

type EmbeddedNode = { type: string; depth?: number; children?: EmbeddedNode[] };

function demoteEmbeddedHeadings() {
    return (tree: EmbeddedNode) => {
        const visit = (node: EmbeddedNode) => {
            if (node.type === 'heading' && typeof node.depth === 'number') {
                node.depth = Math.min(6, node.depth + 1);
            }
            if (node.children) for (const child of node.children) visit(child);
        };
        visit(tree);
    };
}

const forbiddenAttributes: Record<string, true> = { style: true, id: true, name: true };
const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(demoteEmbeddedHeadings)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, {
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
    })
    .use(rehypeShiki, {
        themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
        defaultColor: false
    })
    .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
    const result = await processor.process(markdown);
    return String(result);
}
