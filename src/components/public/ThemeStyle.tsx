'use client';
import { useEffect } from 'react';
import type { ThemeSettings } from '@/lib/settings';

interface CustomFont { family: string; filename: string; format: string; }

function generateFontFace(font: CustomFont): string {
  const family = font.family.replace(/[^a-zA-Z0-9\s-]/g, '');
  const filename = font.filename.replace(/[^a-zA-Z0-9._-]/g, '');
  const formatMap: Record<string, string> = { woff: 'woff', woff2: 'woff2', ttf: 'truetype', otf: 'opentype' };
  const format = formatMap[font.format] || 'woff2';
  return `@font-face{font-family:'${family}';src:url('/uploads/${filename}')format('${format}');font-weight:normal;font-style:normal;font-display:swap;}`;
}

export function ThemeStyle({ theme, customFonts = [] }: { theme: ThemeSettings; customFonts?: CustomFont[] }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', theme.primaryColor);
    root.style.setProperty('--color-secondary', theme.secondaryColor);
    root.style.setProperty('--color-accent', theme.accentColor);
    root.style.setProperty('--color-background', theme.backgroundColor);
    root.style.setProperty('--color-foreground', theme.foregroundColor);
    root.style.setProperty('--font-heading', `"${theme.headingFont}", serif`);
    root.style.setProperty('--font-body', `"${theme.bodyFont}", sans-serif`);
    const existing = document.getElementById('custom-fonts-style');
    if (existing) existing.remove();
    if (customFonts.length > 0) {
      const style = document.createElement('style');
      style.id = 'custom-fonts-style';
      style.textContent = customFonts.map(generateFontFace).join('');
      document.head.appendChild(style);
    }
    return () => { const el = document.getElementById('custom-fonts-style'); if (el) el.remove(); };
  }, [theme, customFonts]);
  return null;
}
