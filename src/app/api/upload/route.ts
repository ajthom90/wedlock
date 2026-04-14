import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import heicConvert from 'heic-convert';

const imageTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
];
const heicTypes = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const fontTypes = [
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-ttf',
  'application/x-font-opentype',
  'application/vnd.ms-fontobject',
];

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FONT_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const isFont = type === 'font';
    const allowedTypes = isFont ? fontTypes : imageTypes;
    const maxBytes = isFont ? MAX_FONT_BYTES : MAX_IMAGE_BYTES;

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed: ${
            isFont ? 'font (WOFF, WOFF2, TTF, OTF)' : 'image (JPG, PNG, GIF, WebP, HEIC)'
          }`,
        },
        { status: 400 },
      );
    }
    if (file.size > maxBytes) {
      const maxMb = maxBytes / (1024 * 1024);
      return NextResponse.json({ error: `File too large. Maximum size is ${maxMb}MB` }, { status: 400 });
    }

    let buffer = Buffer.from(await file.arrayBuffer());
    let ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';

    // HEIC/HEIF → JPEG conversion
    if (heicTypes.has(file.type)) {
      const converted = await heicConvert({
        buffer: buffer as unknown as ArrayBufferLike,
        format: 'JPEG',
        quality: 0.9,
      });
      buffer = Buffer.from(converted);
      ext = 'jpg';
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${random}.${ext}`;
    const uploadDir = '/data/uploads';
    if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    return NextResponse.json({ success: true, url: `/uploads/${filename}`, filename, size: buffer.length });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
