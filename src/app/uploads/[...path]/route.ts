import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const mimeTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');
    if (filePath.includes('..') || filePath.includes('~')) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    const fullPath = path.join('/data/uploads', filePath);
    if (!existsSync(fullPath)) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const data = await readFile(fullPath);
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    return new NextResponse(data, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
