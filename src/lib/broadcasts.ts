import prisma from './prisma';
import { sendMail } from './email';
import { getSiteSettings } from './settings';

export type SendBroadcastResult =
  | { ok: true; broadcastId: string; sent: number; failed: number }
  | { ok: false; error: string };

export async function sendBroadcast(args: { subject: string; body: string }): Promise<SendBroadcastResult> {
  const recipients = await prisma.invitation.findMany({
    where: { contactEmail: { not: null } },
    select: { id: true, householdName: true, contactEmail: true },
  });
  if (recipients.length === 0) return { ok: false, error: 'No recipients opted in' };

  const site = await getSiteSettings();
  const fromName = `${site.coupleName1} & ${site.coupleName2}`;
  const replyTo = site.replyToEmail || undefined;

  const broadcast = await prisma.broadcast.create({
    data: {
      subject: args.subject,
      body: args.body,
      sentBy: 'admin',
      recipientCount: recipients.length,
    },
  });

  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const email = r.contactEmail!;
    const result = await sendMail({
      to: email,
      subject: args.subject,
      body: args.body,
      fromName,
      replyTo,
    });
    await prisma.broadcastDelivery.create({
      data: {
        broadcastId: broadcast.id,
        invitationId: r.id,
        emailAddress: email,
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : result.error,
      },
    });
    if (result.ok) sent++; else failed++;
  }

  return { ok: true, broadcastId: broadcast.id, sent, failed };
}

export async function listBroadcasts() {
  return prisma.broadcast.findMany({
    orderBy: { sentAt: 'desc' },
    include: {
      deliveries: { select: { status: true } },
    },
  });
}

export async function getBroadcast(id: string) {
  return prisma.broadcast.findUnique({
    where: { id },
    include: {
      deliveries: {
        include: { invitation: { select: { householdName: true } } },
        orderBy: { sentAt: 'asc' },
      },
    },
  });
}
