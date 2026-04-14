import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'blockquote',
  'span',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'style', 'class'];

// Whitelist of CSS properties permitted on any inline style attribute. Anything
// outside this list is stripped. Keeps the editor's formatting features working
// (alignment, line spacing, font family) without opening the door to
// position:fixed or other visual-abuse vectors.
const ALLOWED_STYLE_PROPERTIES = new Set([
  'text-align',
  'font-family',
  'line-height',
]);

function filterStyleAttribute(styleValue: string): string {
  return styleValue
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const colonIdx = decl.indexOf(':');
      if (colonIdx === -1) return false;
      const prop = decl.slice(0, colonIdx).trim().toLowerCase();
      if (!ALLOWED_STYLE_PROPERTIES.has(prop)) return false;
      const value = decl.slice(colonIdx + 1).trim();
      // Reject any value containing CSS functions (expression(), url(), etc.) —
      // none of our allowed properties legitimately need parens.
      if (/[()]/.test(value)) return false;
      // Reject the legacy IE expression keyword even without parens.
      if (/expression/i.test(value)) return false;
      return true;
    })
    .join('; ');
}

// Force target/rel on every anchor so legacy plain-text content containing
// literal <a> markup can't miss the security attributes, and filter style
// attributes to the allowed property whitelist.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.hasAttribute?.('style')) {
    const filtered = filterStyleAttribute(node.getAttribute('style') || '');
    if (filtered) node.setAttribute('style', filtered);
    else node.removeAttribute('style');
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
  });
}
