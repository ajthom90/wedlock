import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const vendors = await prisma.vendorContact.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    return NextResponse.json(vendors);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { name, role, phone, email, website, notes } = await request.json();
    if (!name?.trim() || !role?.trim()) {
      return NextResponse.json({ error: 'Name and role are required' }, { status: 400 });
    }
    const maxOrder = await prisma.vendorContact.aggregate({ _max: { order: true } });
    const vendor = await prisma.vendorContact.create({
      data: {
        name: name.trim(),
        role: role.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        website: website?.trim() || null,
        notes: notes?.trim() || null,
        order: (maxOrder._max.order || 0) + 1,
      },
    });
    return NextResponse.json(vendor);
  } catch (error) {
    console.error('Error creating vendor:', error);
    return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 });
  }
}
