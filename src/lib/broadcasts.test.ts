import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendBroadcast } from './broadcasts';
import prisma from './prisma';
import * as emailModule from './email';

describe('sendBroadcast', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.setting, 'findMany').mockResolvedValue([
      { id: '1', key: 'site.coupleName1', value: 'Joe' },
      { id: '2', key: 'site.coupleName2', value: 'Alex' },
      { id: '3', key: 'site.replyToEmail', value: 'couple@example.com' },
    ] as any);
  });

  it('returns 0 / 0 and creates no Broadcast row when no recipients have contactEmail', async () => {
    vi.spyOn(prisma.invitation, 'findMany').mockResolvedValue([] as any);
    const createSpy = vi.spyOn(prisma.broadcast, 'create');
    const result = await sendBroadcast({ subject: 's', body: 'b' });
    expect(result).toEqual({ ok: false, error: 'No recipients opted in' });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('creates one BroadcastDelivery per recipient on success', async () => {
    vi.spyOn(prisma.invitation, 'findMany').mockResolvedValue([
      { id: 'inv-1', householdName: 'A', contactEmail: 'a@test' },
      { id: 'inv-2', householdName: 'B', contactEmail: 'b@test' },
    ] as any);
    const broadcastCreate = vi.spyOn(prisma.broadcast, 'create').mockResolvedValue({ id: 'bc-1' } as any);
    const deliveryCreate = vi.spyOn(prisma.broadcastDelivery, 'create').mockResolvedValue({} as any);
    const sendSpy = vi.spyOn(emailModule, 'sendMail').mockResolvedValue({ ok: true });

    const result = await sendBroadcast({ subject: 'Test', body: 'Hi' });
    expect(result).toEqual({ ok: true, broadcastId: 'bc-1', sent: 2, failed: 0 });
    expect(broadcastCreate).toHaveBeenCalledOnce();
    expect(broadcastCreate.mock.calls[0][0].data.recipientCount).toBe(2);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(deliveryCreate).toHaveBeenCalledTimes(2);
    const statuses = deliveryCreate.mock.calls.map((c) => (c[0] as any).data.status);
    expect(statuses).toEqual(['sent', 'sent']);
  });

  it('records per-recipient failure without aborting the loop', async () => {
    vi.spyOn(prisma.invitation, 'findMany').mockResolvedValue([
      { id: 'inv-1', householdName: 'A', contactEmail: 'a@test' },
      { id: 'inv-2', householdName: 'B', contactEmail: 'b@test' },
      { id: 'inv-3', householdName: 'C', contactEmail: 'c@test' },
    ] as any);
    vi.spyOn(prisma.broadcast, 'create').mockResolvedValue({ id: 'bc-1' } as any);
    const deliveryCreate = vi.spyOn(prisma.broadcastDelivery, 'create').mockResolvedValue({} as any);
    vi.spyOn(emailModule, 'sendMail')
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'bounced' })
      .mockResolvedValueOnce({ ok: true });

    const result = await sendBroadcast({ subject: 's', body: 'b' });
    expect(result).toEqual({ ok: true, broadcastId: 'bc-1', sent: 2, failed: 1 });
    const statuses = deliveryCreate.mock.calls.map((c) => (c[0] as any).data.status);
    const errors = deliveryCreate.mock.calls.map((c) => (c[0] as any).data.errorMessage);
    expect(statuses).toEqual(['sent', 'failed', 'sent']);
    expect(errors[1]).toBe('bounced');
  });

  it('snapshots the email address into BroadcastDelivery.emailAddress', async () => {
    vi.spyOn(prisma.invitation, 'findMany').mockResolvedValue([
      { id: 'inv-1', householdName: 'A', contactEmail: 'a@test' },
    ] as any);
    vi.spyOn(prisma.broadcast, 'create').mockResolvedValue({ id: 'bc-1' } as any);
    const deliveryCreate = vi.spyOn(prisma.broadcastDelivery, 'create').mockResolvedValue({} as any);
    vi.spyOn(emailModule, 'sendMail').mockResolvedValue({ ok: true });

    await sendBroadcast({ subject: 's', body: 'b' });
    expect((deliveryCreate.mock.calls[0][0] as any).data.emailAddress).toBe('a@test');
  });
});
