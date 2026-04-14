import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: {
      name?: string;
      role?: string;
      phone?: string | null;
      email?: string | null;
      website?: string | null;
      notes?: string | null;
      order?: number;
    } = {};
    if ('name' in body) data.name = body.name?.trim();
    if ('role' in body) data.role = body.role?.trim();
    if ('phone' in body) data.phone = body.phone?.trim() || null;
    if ('email' in body) data.email = body.email?.trim() || null;
    if ('website' in body) data.website = body.website?.trim() || null;
    if ('notes' in body) data.notes = body.notes?.trim() || null;
    if ('order' in body && typeof body.order === 'number') data.order = body.order;

    const vendor = await prisma.vendorContact.update({ where: { id }, data });
    return NextResponse.json(vendor);
  } catch (error) {
    console.error('Error updating vendor:', error);
    return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.vendorContact.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting vendor:', error);
    return NextResponse.json({ error: 'Failed to delete vendor' }, { status: 500 });
  }
}
