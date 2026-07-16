import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { getTheme, getSiteSettings } from '@/lib/settings';
import { generateQRCode, buildRsvpUrl } from '@/lib/qr';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadPdfFont } from '@/lib/pdfFonts';

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

    const customFontRefs = customFonts.map((f) => ({ family: f.family, filename: f.filename }));
    let headingFont, bodyFont;
    try { headingFont = await pdf.embedFont(await loadPdfFont(theme.headingFont, 400, customFontRefs)); }
    catch { headingFont = await pdf.embedFont(StandardFonts.Helvetica); }
    try { bodyFont = await pdf.embedFont(await loadPdfFont(theme.bodyFont, 400, customFontRefs)); }
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
