import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getFeatures } from '@/lib/settings';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(request: Request) {
  try {
    const features = await getFeatures();
    if (!features.guestPhotoUpload) return NextResponse.json({ error: 'Guest photo upload is not enabled' }, { status: 403 });
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;
    const caption = formData.get('caption') as string;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!imageTypes.includes(file.type)) return NextResponse.json({ error: 'Invalid file type. Allowed: image (JPG, PNG, GIF, WebP)' }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File too large. Maximum size is 5MB' }, { status: 400 });
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${random}.${ext}`;
    const uploadDir = '/data/uploads';
    if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);
    const photo = await prisma.photo.create({ data: { url: `/uploads/${filename}`, caption: caption || null, isGuestUpload: true, approved: false, uploadedBy: name } });
    return NextResponse.json({ success: true, photo });
  } catch (error) {
    console.error('Error uploading guest photo:', error);
    return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 });
  }
}
