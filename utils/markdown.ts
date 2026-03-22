import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeShiki from '@shikijs/rehype';
import rehypeStringify from 'rehype-stringify';

function createProcessor(theme: 'light' | 'dark') {
    return unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype, { allowDangerousHtml: false })
        .use(rehypeShiki, {
            theme: theme === 'dark' ? 'vitesse-dark' : 'vitesse-light'
        })
        .use(rehypeStringify);
}

type MarkdownProcessor = ReturnType<typeof createProcessor>;

let lightProcessor: MarkdownProcessor | null = null;
let darkProcessor: MarkdownProcessor | null = null;

async function getProcessor(theme: 'light' | 'dark') {
    if (theme === 'light' && lightProcessor) return lightProcessor;
    if (theme === 'dark' && darkProcessor) return darkProcessor;

    const processor = createProcessor(theme);

    if (theme === 'light') lightProcessor = processor;
    else darkProcessor = processor;

    return processor;
}

export async function renderMarkdown(
    markdown: string,
    theme: 'light' | 'dark' = 'dark'
): Promise<string> {
    const processor = await getProcessor(theme);
    const result = await processor.process(markdown);
    return String(result);
}
