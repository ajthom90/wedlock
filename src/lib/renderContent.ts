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

  // Legacy plain-text content doesn't start with an HTML tag.
  const isHtml = trimmed.startsWith('<');
  const html = isHtml ? trimmed : plainTextToHtml(trimmed);

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block inline style (cheapest XSS vector).
    FORBID_ATTR: ['style'],
  });
}
