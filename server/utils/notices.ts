import sanitizeHtml from 'sanitize-html';

const NOTICE_ALLOWED_TAGS = [
    'p',
    'br',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'span'
];

export function sanitizeNoticeContent(content: string): string {
    return sanitizeHtml(content, {
        allowedTags: NOTICE_ALLOWED_TAGS,
        allowedAttributes: {
            a: ['href', 'target', 'rel'],
            span: ['style']
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesAppliedToAttributes: ['href']
    });
}
