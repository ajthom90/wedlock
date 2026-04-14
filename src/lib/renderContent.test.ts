import { describe, it, expect } from 'vitest';
import { renderContent } from './renderContent';

describe('renderContent', () => {
  it('returns empty string for empty input', () => {
    expect(renderContent('')).toBe('');
    expect(renderContent(undefined)).toBe('');
    expect(renderContent(null)).toBe('');
  });

  it('wraps plain text in paragraph tags', () => {
    expect(renderContent('Hello world.')).toBe('<p>Hello world.</p>');
  });

  it('splits double newlines into paragraphs', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    expect(renderContent(input)).toBe('<p>First paragraph.</p><p>Second paragraph.</p>');
  });

  it('converts single newlines to <br>', () => {
    const input = 'Line one\nLine two';
    expect(renderContent(input)).toBe('<p>Line one<br>Line two</p>');
  });

  it('HTML-escapes plain-text characters', () => {
    const input = 'A & B <script>alert(1)</script>';
    const out = renderContent(input);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&amp;');
    expect(out).toContain('&lt;script&gt;');
  });

  it('passes through already-HTML content (starts with <)', () => {
    const input = '<p>Already <strong>HTML</strong>.</p>';
    expect(renderContent(input)).toBe('<p>Already <strong>HTML</strong>.</p>');
  });

  it('sanitizes HTML content (strips script tags)', () => {
    const input = '<p>Safe</p><script>alert(1)</script>';
    const out = renderContent(input);
    expect(out).toContain('<p>Safe</p>');
    expect(out).not.toContain('<script>');
  });

  it('sanitizes dangerous attributes', () => {
    const input = '<p onclick="alert(1)">Click</p>';
    expect(renderContent(input)).not.toContain('onclick');
  });

  it('strips javascript: URLs on links', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    expect(renderContent(input)).not.toContain('javascript:');
  });

  it('allows images, links, headings, lists', () => {
    const input = '<h2>Head</h2><p><a href="https://example.com">link</a></p><ul><li>a</li></ul><img src="/uploads/x.jpg" alt="x">';
    const out = renderContent(input);
    expect(out).toContain('<h2');
    expect(out).toContain('<a ');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('<ul');
    expect(out).toContain('<li');
    expect(out).toContain('<img');
    expect(out).toContain('src="/uploads/x.jpg"');
  });

  it('forces target="_blank" and rel="noopener noreferrer" on links', () => {
    const input = '<a href="https://example.com">click</a>';
    const out = renderContent(input);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('overrides existing target and rel with safe defaults', () => {
    const input = '<a href="https://example.com" target="_self" rel="bookmark">click</a>';
    const out = renderContent(input);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('allows text-align via inline style', () => {
    const input = '<p style="text-align: center">centered</p>';
    expect(renderContent(input)).toContain('text-align: center');
  });

  it('allows font-family via inline style', () => {
    const input = '<span style="font-family: Playfair Display">styled</span>';
    expect(renderContent(input)).toContain('font-family: Playfair Display');
  });

  it('allows line-height via inline style', () => {
    const input = '<p style="line-height: 1.8">relaxed</p>';
    expect(renderContent(input)).toContain('line-height: 1.8');
  });

  it('strips disallowed CSS properties from style attribute', () => {
    const input = '<p style="position: fixed; top: 0; left: 0; text-align: center">abuse</p>';
    const out = renderContent(input);
    expect(out).not.toContain('position');
    expect(out).not.toContain('top:');
    expect(out).not.toContain('left:');
    expect(out).toContain('text-align: center');
  });

  it('removes style attribute entirely when no properties remain', () => {
    const input = '<p style="position: absolute; z-index: 9999">abuse</p>';
    const out = renderContent(input);
    expect(out).not.toContain('style=');
  });

  it('allows class attribute and span tag', () => {
    const input = '<p class="my-class">text</p><span class="another">inline</span>';
    const out = renderContent(input);
    expect(out).toContain('class="my-class"');
    expect(out).toContain('<span');
    expect(out).toContain('class="another"');
  });

  it('still blocks expression() inside allowed style', () => {
    // DOMPurify's default CSS sanitizer should drop the entire malformed style.
    const input = '<p style="text-align: expression(alert(1))">sneaky</p>';
    const out = renderContent(input);
    expect(out).not.toContain('expression');
  });
});
