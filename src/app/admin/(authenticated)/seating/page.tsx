'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ChildSeatBadge } from '@/components/admin/ChildSeatSelect';
import { ReceptionSheetCard } from '@/components/admin/ReceptionSheetCard';
import { listAttendees, type AttendeeInvitation } from '@/lib/attendees';
import { isPlusOneSeat, normName, plusOnesOf } from '@/lib/seatLinking';
import { parseTableNumber, tableHeading } from '@/lib/tableNumbers';

// Child seat + allergies for one person, looked up by guest id for named
// guests and by invitation + name for plus-ones (who have no Guest row).
interface GuestNeeds { childSeat: string | null; dietary: string }
const needsKey = (invitationId: string | null, name: string) => `${invitationId ?? ''}|${normName(name)}`;
const idKey = (guestId: string) => `id:${guestId}`;

// A seat links to its guest (guestId) so renames keep it; plus-one seats and
// seats that lost their guest before links existed have guestName only.
interface TableAssignment {
  id: string;
  guestName: string;
  invitationId: string | null;
  guestId: string | null;
  guest: { id: string; name: string; invitationId: string } | null;
}

const seatName = (a: TableAssignment) => a.guest?.name ?? a.guestName;

interface Table {
  id: string;
  name: string;
  number: number | null;
  capacity: number;
  assignments: TableAssignment[];
}

interface UnseatedGuest {
  // Synthetic React key — built from invitation + primary-guest id or plus-one index
  // so React keeps rows stable across re-renders.
  key: string;
  name: string;
  invitationId: string;
  householdName: string;
  guestId: string | null; // null for plus-ones
}

export default function SeatingPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [unseatedGuests, setUnseatedGuests] = useState<UnseatedGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [tableName, setTableName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [tableCapacity, setTableCapacity] = useState('8');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [needs, setNeeds] = useState<Map<string, GuestNeeds>>(new Map());
  const [plusOnes, setPlusOnes] = useState<{ invitationId: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<{ childSeats?: boolean; nameTents?: boolean; dietaryNotes?: boolean; receptionSheet?: boolean }>({});

  useEffect(() => {
    fetch('/api/features').then((r) => (r.ok ? r.json() : {})).then(setFeatures).catch(() => setFeatures({}));
  }, []);

  const needsFor = (invitationId: string | null, name: string, guestId?: string | null): GuestNeeds | undefined =>
    guestId ? needs.get(idKey(guestId)) : needs.get(needsKey(invitationId, name));
  // Unlinked and not a plus-one: the seat lost its guest and needs fixing.
  const isFlagged = (a: TableAssignment) => !a.guestId && !isPlusOneSeat(a, plusOnes);
  const flaggedSeats = tables.flatMap((t) => t.assignments.filter(isFlagged).map((a) => ({ table: t, assignment: a })));
  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch('/api/tables');
      if (res.ok) {
        const data = await res.json();
        setTables(data);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    }
  }, []);

  const fetchUnseatedGuests = useCallback(async () => {
    try {
      const [invitationsRes, tablesRes] = await Promise.all([
        fetch('/api/invitations'),
        fetch('/api/tables'),
      ]);
      if (invitationsRes.ok && tablesRes.ok) {
        const invitations = await invitationsRes.json();
        const tablesData = await tablesRes.json();

        // Named guests are seated by id; plus-ones by household + name.
        const seatedIds = new Set<string>();
        const seatedByName = new Set<string>();
        tablesData.forEach((table: Table) => {
          table.assignments?.forEach((a: TableAssignment) => {
            if (a.guestId) seatedIds.add(a.guestId);
            else seatedByName.add(needsKey(a.invitationId, a.guestName));
          });
        });

        // An attending invitation contributes up to two sources of attendees:
        //   1. primary guests the household selected (attendingGuests = JSON
        //      array of Guest.id values we resolve against inv.guests), and
        //   2. plus-ones the household filled in (plusOnes = JSON array of
        //      { name, meal }).
        // Both need to appear in the unseated list, with enough metadata
        // (invitationId, householdName) for the UI to group and assign them.
        type InvitationFromApi = {
          id: string;
          householdName: string;
          guests: { id: string; name: string }[];
          response?: {
            attending: string;
            attendingGuests: string | null;
            plusOnes: string | null;
          } | null;
        };
        const safeParse = <T,>(raw: string | null, fallback: T): T => {
          if (!raw) return fallback;
          try { return JSON.parse(raw) as T; } catch { return fallback; }
        };

        const attendingGuests: UnseatedGuest[] = [];
        (invitations as InvitationFromApi[]).forEach((inv) => {
          if (inv.response?.attending !== 'yes') return;

          const guestsById = new Map(inv.guests.map((g) => [g.id, g.name]));
          const attendingIds = safeParse<string[]>(inv.response.attendingGuests, []);
          attendingIds.forEach((id) => {
            const name = guestsById.get(id);
            if (name !== undefined && !seatedIds.has(id)) {
              attendingGuests.push({
                key: `${inv.id}-${id}`,
                name,
                invitationId: inv.id,
                householdName: inv.householdName,
                guestId: id,
              });
            }
          });

          const pluses = safeParse<{ name: string }[]>(inv.response.plusOnes, []);
          pluses.forEach((p, idx) => {
            if (!p?.name) return;
            if (!seatedByName.has(needsKey(inv.id, p.name))) {
              attendingGuests.push({
                key: `${inv.id}-plusone-${idx}`,
                name: p.name,
                invitationId: inv.id,
                householdName: inv.householdName,
                guestId: null,
              });
            }
          });
        });

        setUnseatedGuests(attendingGuests);

        const needsMap = new Map<string, GuestNeeds>();
        (invitations as AttendeeInvitation[]).forEach((inv) => {
          // Everyone goes in, needs or not, so a guest with none never borrows
          // a same-named guest's badges from another household.
          for (const a of listAttendees(inv).attendees) {
            const n = { childSeat: a.childSeat, dietary: a.dietary };
            needsMap.set(a.guestId ? idKey(a.guestId) : needsKey(inv.id, a.name), n);
          }
        });
        setNeeds(needsMap);
        setPlusOnes((invitations as InvitationFromApi[]).flatMap((inv) => (inv.response?.attending === 'yes' ? plusOnesOf(inv) : [])));
      }
    } catch (error) {
      console.error('Failed to fetch unseated guests:', error);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchTables(), fetchUnseatedGuests()]);
    setLoading(false);
  }, [fetchTables, fetchUnseatedGuests]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openAddTable = () => {
    setEditingTable(null);
    setTableName('');
    setTableNumber('');
    setTableCapacity('8');
    setTableModalOpen(true);
  };

  const openEditTable = (table: Table) => {
    setEditingTable(table);
    setTableName(table.name);
    setTableNumber(table.number == null ? '' : String(table.number));
    setTableCapacity(String(table.capacity));
    setTableModalOpen(true);
  };

  const closeTableModal = () => {
    setTableModalOpen(false);
    setEditingTable(null);
    setTableName('');
    setTableNumber('');
    setTableCapacity('8');
  };

  const handleSaveTable = async () => {
    const number = parseTableNumber(tableNumber);
    const body = JSON.stringify({ name: tableName, number, capacity: parseInt(tableCapacity) });
    setSaving(true);
    try {
      if (editingTable) {
        const res = await fetch(`/api/tables/${editingTable.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (res.ok) {
          await fetchAll();
          if (selectedTable?.id === editingTable.id) {
            setSelectedTable({ ...selectedTable, name: tableName, number, capacity: parseInt(tableCapacity) });
          }
          closeTableModal();
        }
      } else {
        const res = await fetch('/api/tables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (res.ok) {
          await fetchAll();
          closeTableModal();
        }
      }
    } catch (error) {
      console.error('Failed to save table:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTable = async (id: string) => {
    try {
      const res = await fetch(`/api/tables/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedTable?.id === id) setSelectedTable(null);
        await fetchAll();
      }
    } catch (error) {
      console.error('Failed to delete table:', error);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Keeps the currently-selected table in sync after a mutation so the right
  // panel reflects the new state (Prisma doesn't push; we re-fetch).
  const refreshSelectedTable = useCallback(async (tableId: string) => {
    const res = await fetch('/api/tables');
    if (!res.ok) return;
    const updatedTables: Table[] = await res.json();
    const updated = updatedTables.find((t) => t.id === tableId);
    if (updated) setSelectedTable(updated);
  }, []);

  // Seat someone by POSTing to /api/tables/assign: a named guest by id, a
  // plus-one by name + invitation.
  const createAssignment = useCallback(async (tableId: string, guest: UnseatedGuest) => {
    const res = await fetch('/api/tables/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(guest.guestId
        ? { tableId, guestId: guest.guestId }
        : { tableId, guestName: guest.name, invitationId: guest.invitationId }),
    });
    return res.ok;
  }, []);

  // Move a seat (tableId) or link a flagged seat to a guest (guestId).
  const patchAssignment = useCallback(async (assignmentId: string, patch: { tableId?: string; guestId?: string }) => {
    const res = await fetch('/api/tables/assign', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId, ...patch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? 'Could not update the seat');
    }
    return res.ok;
  }, []);

  const deleteAssignment = useCallback(async (assignmentId: string) => {
    const res = await fetch('/api/tables/assign', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId }),
    });
    return res.ok;
  }, []);

  const handleAssignUnseated = async (guest: UnseatedGuest) => {
    if (!selectedTable) return;
    setSaving(true);
    try {
      const ok = await createAssignment(selectedTable.id, guest);
      if (ok) {
        await fetchAll();
        await refreshSelectedTable(selectedTable.id);
      }
    } catch (error) {
      console.error('Failed to add assignment:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAssignHousehold = async (invitationId: string, guests: UnseatedGuest[]) => {
    if (!selectedTable) return;
    setSaving(true);
    try {
      // Sequential to keep order stable in the table view (the API doesn't
      // accept bulk inserts and parallel creates can interleave).
      for (const g of guests) {
        await createAssignment(selectedTable.id, { ...g, invitationId });
      }
      await fetchAll();
      await refreshSelectedTable(selectedTable.id);
    } catch (error) {
      console.error('Failed to add household:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!selectedTable) return;
    try {
      const ok = await deleteAssignment(assignmentId);
      if (ok) {
        await fetchAll();
        await refreshSelectedTable(selectedTable.id);
      }
    } catch (error) {
      console.error('Failed to remove assignment:', error);
    }
  };

  // Move a seat to a different table; it keeps its guest link.
  const handleMoveAssignment = async (assignment: TableAssignment, toTableId: string) => {
    if (!selectedTable) return;
    setSaving(true);
    try {
      if (!(await patchAssignment(assignment.id, { tableId: toTableId }))) return;
      await fetchAll();
      await refreshSelectedTable(selectedTable.id);
    } catch (error) {
      console.error('Failed to move assignment:', error);
    } finally {
      setSaving(false);
    }
  };

  // Link a flagged seat to the guest it was meant for.
  const handleLinkAssignment = async (assignment: TableAssignment, guestId: string) => {
    setSaving(true);
    setError(null);
    try {
      if (!(await patchAssignment(assignment.id, { guestId }))) return;
      await fetchAll();
      if (selectedTable) await refreshSelectedTable(selectedTable.id);
    } catch (error) {
      console.error('Failed to link seat:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading seating chart...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Seating Chart</h1>
        <div className="flex gap-2">
          {features.nameTents !== false && (
            <a href="/admin/seating/name-tents">
              <Button size="sm" variant="outline">Print Name Tents</Button>
            </a>
          )}
          <a href="/api/tables/export">
            <Button size="sm" variant="outline">Download Spreadsheet</Button>
          </a>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {flaggedSeats.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm font-medium text-red-800">
              {flaggedSeats.length === 1 ? '1 seat isn’t' : `${flaggedSeats.length} seats aren’t`} linked to a guest
            </p>
            <p className="text-sm text-red-700">
              These were seated by a name that no longer matches anyone on the guest list, so they have no meal, allergies or
              child seat. Open the table, then link each seat to the right guest or remove it.
            </p>
            <div className="flex flex-wrap gap-2">
              {flaggedSeats.map(({ table, assignment }) => (
                <Button key={assignment.id} size="sm" variant="outline" onClick={() => setSelectedTable(table)}>
                  {tableHeading(table)}: {assignment.guestName}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {features.receptionSheet !== false && <ReceptionSheetCard />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left side: Tables list */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Tables</h2>
            <Button size="sm" onClick={openAddTable}>Add Table</Button>
          </div>

          {tables.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-gray-500">No tables created yet.</p>
              </CardContent>
            </Card>
          ) : (
            tables.map((table) => (
              <Card
                key={table.id}
                className={`cursor-pointer transition-colors ${selectedTable?.id === table.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedTable(table)}
              >
                <CardContent className="py-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{tableHeading(table)}</p>
                      <p className="text-sm text-gray-500">
                        {table.assignments?.length || 0} / {table.capacity} seats filled
                      </p>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => openEditTable(table)}>Edit</Button>
                      {deleteConfirm === table.id ? (
                        <>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteTable(table.id)}>Confirm</Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(table.id)}>Delete</Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Right side: seated + unseated workspace. */}
        <div className="space-y-4">
          {selectedTable ? (
            <Card>
              <CardHeader>
                <div className="flex items-baseline justify-between">
                  <CardTitle>{tableHeading(selectedTable)}</CardTitle>
                  <span className={`text-sm ${
                    (selectedTable.assignments?.length || 0) > selectedTable.capacity ? 'text-red-700 font-semibold' : 'text-gray-500'
                  }`}>
                    {selectedTable.assignments?.length || 0} / {selectedTable.capacity} seats
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Seated at this table</p>
                  {selectedTable.assignments?.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No one seated yet. Pick a guest below.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedTable.assignments?.map((assignment) => (
                        <div key={assignment.id} className={`flex flex-wrap items-center gap-2 py-2 px-3 rounded ${isFlagged(assignment) ? 'bg-red-50' : 'bg-gray-50'}`}>
                          <span className="flex-1 text-sm">
                            {seatName(assignment)}
                            {isFlagged(assignment) ? (
                              <span className="ml-1 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">Not linked to a guest</span>
                            ) : (
                              <NeedsBadges needs={needsFor(assignment.invitationId, assignment.guestName, assignment.guestId)} features={features} />
                            )}
                          </span>
                          {isFlagged(assignment) && (
                            <select
                              className="text-xs border border-red-300 rounded px-2 py-1 bg-white"
                              value=""
                              onChange={(e) => {
                                if (e.target.value) handleLinkAssignment(assignment, e.target.value);
                              }}
                              disabled={saving}
                              title="Link this seat to a guest"
                            >
                              <option value="">Link to guest…</option>
                              {linkChoices(assignment, unseatedGuests).map((g) => (
                                <option key={g.key} value={g.guestId!}>{g.name} ({g.householdName})</option>
                              ))}
                            </select>
                          )}
                          <select
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                            value=""
                            onChange={(e) => {
                              const toTableId = e.target.value;
                              if (toTableId) handleMoveAssignment(assignment, toTableId);
                            }}
                            disabled={saving || tables.length <= 1}
                            title="Move to another table"
                          >
                            <option value="">Move to…</option>
                            {tables.filter((t) => t.id !== selectedTable.id).map((t) => (
                              <option key={t.id} value={t.id}>{tableHeading(t)}</option>
                            ))}
                          </select>
                          <Button size="sm" variant="danger" onClick={() => handleRemoveAssignment(assignment.id)}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-sm font-medium">Unseated guests</p>
                    <span className="text-xs text-gray-500">{unseatedGuests.length} remaining</span>
                  </div>
                  <UnseatedList
                    needsFor={needsFor}
                    features={features}
                    guests={unseatedGuests}
                    onAssignOne={handleAssignUnseated}
                    onAssignHousehold={handleAssignHousehold}
                    saving={saving}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>Unseated guests</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-3">Select a table on the left to start assigning the guests below.</p>
                <UnseatedList guests={unseatedGuests} saving={false} needsFor={needsFor} features={features} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Table add/edit modal */}
      {tableModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{editingTable ? 'Edit Table' : 'Add Table'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Table Name</label>
                <Input
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. Head Table, Smith Family"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Table Number</label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Optional"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The number on the table. Shown as Table# on the spreadsheet and &ldquo;Table N&rdquo; on name tents. Leave blank for
                  a table known by name, like the Head Table; those are listed first.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Capacity</label>
                <Input
                  type="number"
                  min={1}
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                  placeholder="Number of seats"
                />
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-6 pt-0">
              <Button variant="outline" onClick={closeTableModal}>Cancel</Button>
              <Button onClick={handleSaveTable} disabled={saving || !tableName.trim()}>
                {saving ? 'Saving...' : editingTable ? 'Update' : 'Add'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// Guests a flagged seat could be linked to: unseated named guests, the seat's
// own household first, then the rest by name.
function linkChoices(seat: TableAssignment, unseated: UnseatedGuest[]): UnseatedGuest[] {
  return unseated
    .filter((g) => g.guestId)
    .sort((a, b) =>
      Number(b.invitationId === seat.invitationId) - Number(a.invitationId === seat.invitationId) ||
      a.name.localeCompare(b.name));
}

// Unseated guests grouped by household. Households with 2+ unseated members
// get a "seat whole household" shortcut, which is the most common case for
// wedding seating. onAssignOne/onAssignHousehold are only wired when a table
// is selected; otherwise the list is purely informational.
function NeedsBadges({ needs, features }: {
  needs: GuestNeeds | undefined;
  features: { childSeats?: boolean; dietaryNotes?: boolean };
}) {
  if (!needs) return null;
  return (
    <>
      {features.childSeats !== false && <ChildSeatBadge seat={needs.childSeat} />}
      {features.dietaryNotes !== false && needs.dietary && (
        <span className="ml-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full" title={needs.dietary}>
          Allergy: {needs.dietary.length > 24 ? `${needs.dietary.slice(0, 24)}…` : needs.dietary}
        </span>
      )}
    </>
  );
}

function UnseatedList({
  guests,
  onAssignOne,
  onAssignHousehold,
  saving,
  needsFor,
  features,
}: {
  needsFor: (invitationId: string | null, name: string, guestId?: string | null) => GuestNeeds | undefined;
  features: { childSeats?: boolean; dietaryNotes?: boolean };
  guests: UnseatedGuest[];
  onAssignOne?: (guest: UnseatedGuest) => void;
  onAssignHousehold?: (invitationId: string, guests: UnseatedGuest[]) => void;
  saving: boolean;
}) {
  const groups = useMemo(() => {
    // Preserve insertion order so households stay grouped as they appeared in
    // the source scan (no alphabetical re-sort — the original order is
    // already RSVP-created-at order, which feels natural).
    const byHousehold = new Map<string, { householdName: string; members: UnseatedGuest[] }>();
    for (const g of guests) {
      const bucket = byHousehold.get(g.invitationId);
      if (bucket) bucket.members.push(g);
      else byHousehold.set(g.invitationId, { householdName: g.householdName, members: [g] });
    }
    return Array.from(byHousehold.entries()).map(([invitationId, v]) => ({ invitationId, ...v }));
  }, [guests]);

  if (guests.length === 0) {
    return <p className="text-sm text-gray-500 italic">All attending guests have been seated. 🎉</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map(({ invitationId, householdName, members }) => (
        <div key={invitationId} className="border border-gray-200 rounded">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-medium text-gray-700">{householdName}</p>
            {onAssignHousehold && members.length > 1 && (
              <Button size="sm" variant="outline" disabled={saving} onClick={() => onAssignHousehold(invitationId, members)}>
                Seat whole household
              </Button>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {members.map((g) => (
              <div key={g.key} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm">
                  {g.name}
                  <NeedsBadges needs={needsFor(g.invitationId, g.name, g.guestId)} features={features} />
                </span>
                {onAssignOne && (
                  <Button size="sm" disabled={saving} onClick={() => onAssignOne(g)}>
                    Assign
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
