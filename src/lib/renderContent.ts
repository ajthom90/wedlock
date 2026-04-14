import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'blockquote',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt'];

// Force target and rel on every anchor element, regardless of what the input
// provided. DOMPurify's default behavior is to pass attributes through; we
// want stronger guarantees on links.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToHtml(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map((p) => {
      const escaped = escapeHtml(p);
      const withBreaks = escaped.replace(/\n/g, '<br>');
      return `<p>${withBreaks}</p>`;
    })
    .join('');
}

export function renderContent(input: string | null | undefined): string {
  if (!input) return '';

  const trimmed = input.trim();
  if (!trimmed) return '';

  const isHtml = trimmed.startsWith('<');
  const html = isHtml ? trimmed : plainTextToHtml(trimmed);

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_ATTR: ['style'],
  });
}
