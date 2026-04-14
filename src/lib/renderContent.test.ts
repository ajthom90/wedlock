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
});
