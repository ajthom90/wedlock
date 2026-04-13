import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { getTheme, getSiteSettings } from '@/lib/settings';
import { generateQRCode, buildRsvpUrl } from '@/lib/qr';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const googleFontMap: Record<string, string> = {
  'Playfair Display': 'Playfair+Display', 'Cormorant Garamond': 'Cormorant+Garamond',
  'Great Vibes': 'Great+Vibes', Lato: 'Lato', 'Open Sans': 'Open+Sans',
  Roboto: 'Roboto', Merriweather: 'Merriweather', Montserrat: 'Montserrat',
};
const fontCache = new Map<string, Uint8Array>();

async function loadCustomFont(filename: string): Promise<Uint8Array> {
  const key = `custom:${filename}`;
  if (fontCache.has(key)) return fontCache.get(key)!;
  const filePath = path.join('/data/uploads', filename);
  if (!existsSync(filePath)) throw new Error(`Custom font file not found: ${filename}`);
  const data = new Uint8Array(await readFile(filePath));
  fontCache.set(key, data);
  return data;
}

async function loadGoogleFont(fontName: string): Promise<Uint8Array> {
  const key = `google:${fontName}`;
  if (fontCache.has(key)) return fontCache.get(key)!;
  const encoded = googleFontMap[fontName];
  if (!encoded) throw new Error(`Unknown Google Font: ${fontName}`);
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;700&display=swap`;
  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  if (!cssRes.ok) throw new Error(`Failed to fetch Google Font CSS: ${cssRes.statusText}`);
  const css = await cssRes.text();
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match) throw new Error(`Could not find font URL in CSS for ${fontName}`);
  const fontUrl = match[1].replace(/['"]/g, '');
  const fontRes = await fetch(fontUrl);
  if (!fontRes.ok) throw new Error(`Failed to download font file: ${fontRes.statusText}`);
  const data = new Uint8Array(await fontRes.arrayBuffer());
  fontCache.set(key, data);
  return data;
}

async function loadFont(fontName: string, customFonts: { family: string; filename: string }[]): Promise<Uint8Array> {
  const custom = customFonts.find((f) => f.family === fontName);
  if (custom) return loadCustomFont(custom.filename);
  if (fontName in googleFontMap) return loadGoogleFont(fontName);
  console.warn(`Font "${fontName}" not found, falling back to Lato`);
  return loadGoogleFont('Lato');
}

function base64ToUint8Array(dataUrl: string): Uint8Array {
  const base64 = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(base64.length);
  for (let i = 0; i < base64.length; i++) bytes[i] = base64.charCodeAt(i);
  return bytes;
}

export async function GET(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const invitations = await prisma.invitation.findMany({ orderBy: { householdName: 'asc' } });
    if (invitations.length === 0) return NextResponse.json({ error: 'No invitations found' }, { status: 404 });

    const [theme, siteSettings, customFonts] = await Promise.all([getTheme(), getSiteSettings(), prisma.customFont.findMany()]);
    const cardW = 72 * (siteSettings.qrCardWidth || 2);
    const cardH = 72 * (siteSettings.qrCardHeight || 4);
    const cols = Math.floor(576 / cardW);
    const rows = Math.floor(756 / cardH);
    const perPage = cols * rows;
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || 'localhost:3000';
    const baseUrl = `${proto}://${host}`;

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);

    let headingFont, bodyFont;
    try { headingFont = await pdf.embedFont(await loadFont(theme.headingFont, customFonts.map((f) => ({ family: f.family, filename: f.filename })))); }
    catch { headingFont = await pdf.embedFont(StandardFonts.Helvetica); }
    try { bodyFont = await pdf.embedFont(await loadFont(theme.bodyFont, customFonts.map((f) => ({ family: f.family, filename: f.filename })))); }
    catch { bodyFont = await pdf.embedFont(StandardFonts.Helvetica); }

    let page: any = null;
    let cardIndex = 0;
    for (const inv of invitations) {
      if (cardIndex % perPage === 0) page = pdf.addPage([612, 792]);
      const pos = cardIndex % perPage;
      const col = pos % cols;
      const row = Math.floor(pos / cols);
      const x = 18 + col * cardW;
      const y = 774 - (row + 1) * cardH;
      const rsvpUrl = buildRsvpUrl(baseUrl, inv.code);
      const qrDataUrl = await generateQRCode(rsvpUrl, { width: 400 });
      const qrBytes = base64ToUint8Array(qrDataUrl);
      const qrImage = await pdf.embedPng(qrBytes);
      const qrSize = Math.min(cardW - 20, cardH * 0.6);
      const qrX = x + (cardW - qrSize) / 2;
      const qrY = y + cardH - 10 - qrSize - 20;
      page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

      const name = inv.householdName;
      const fontSize = Math.min(14, cardW / 12);
      const nameW = headingFont.widthOfTextAtSize(name, fontSize);
      page.drawText(name, { x: x + (cardW - nameW) / 2, y: qrY - 20, size: fontSize, font: headingFont, color: rgb(0, 0, 0) });

      const codeText = `Code: ${inv.code}`;
      const codeW = bodyFont.widthOfTextAtSize(codeText, 10);
      page.drawText(codeText, { x: x + (cardW - codeW) / 2, y: qrY - 36, size: 10, font: bodyFont, color: rgb(0.4, 0.4, 0.4) });

      const dashed = [4, 3];
      const lineColor = rgb(0.85, 0.85, 0.85);
      page.drawLine({ start: { x, y }, end: { x: x + cardW, y }, color: lineColor, thickness: 0.25, dashArray: dashed });
      page.drawLine({ start: { x, y: y + cardH }, end: { x: x + cardW, y: y + cardH }, color: lineColor, thickness: 0.25, dashArray: dashed });
      page.drawLine({ start: { x, y }, end: { x, y: y + cardH }, color: lineColor, thickness: 0.25, dashArray: dashed });
      page.drawLine({ start: { x: x + cardW, y }, end: { x: x + cardW, y: y + cardH }, color: lineColor, thickness: 0.25, dashArray: dashed });
      cardIndex++;
    }

    const pdfBytes = await pdf.save();
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="rsvp-qr-codes.pdf"', 'Content-Length': pdfBytes.length.toString() },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
