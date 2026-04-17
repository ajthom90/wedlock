'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface TableAssignment {
  id: string;
  guestName: string;
  invitationId: string | null;
}

interface Table {
  id: string;
  name: string;
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
}

export default function SeatingPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [unseatedGuests, setUnseatedGuests] = useState<UnseatedGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('8');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

        const assignedNames = new Set<string>();
        tablesData.forEach((table: Table) => {
          table.assignments?.forEach((a: TableAssignment) => {
            assignedNames.add(a.guestName.toLowerCase());
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
            const name = guestsById.get(id) ?? id;
            if (!assignedNames.has(name.toLowerCase())) {
              attendingGuests.push({
                key: `${inv.id}-${id}`,
                name,
                invitationId: inv.id,
                householdName: inv.householdName,
              });
            }
          });

          const pluses = safeParse<{ name: string }[]>(inv.response.plusOnes, []);
          pluses.forEach((p, idx) => {
            if (!p?.name) return;
            if (!assignedNames.has(p.name.toLowerCase())) {
              attendingGuests.push({
                key: `${inv.id}-plusone-${idx}`,
                name: p.name,
                invitationId: inv.id,
                householdName: inv.householdName,
              });
            }
          });
        });

        setUnseatedGuests(attendingGuests);
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
    setTableCapacity('8');
    setTableModalOpen(true);
  };

  const openEditTable = (table: Table) => {
    setEditingTable(table);
    setTableName(table.name);
    setTableCapacity(String(table.capacity));
    setTableModalOpen(true);
  };

  const closeTableModal = () => {
    setTableModalOpen(false);
    setEditingTable(null);
    setTableName('');
    setTableCapacity('8');
  };

  const handleSaveTable = async () => {
    setSaving(true);
    try {
      if (editingTable) {
        const res = await fetch(`/api/tables/${editingTable.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tableName, capacity: parseInt(tableCapacity) }),
        });
        if (res.ok) {
          await fetchAll();
          if (selectedTable?.id === editingTable.id) {
            setSelectedTable({ ...selectedTable, name: tableName, capacity: parseInt(tableCapacity) });
          }
          closeTableModal();
        }
      } else {
        const res = await fetch('/api/tables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tableName, capacity: parseInt(tableCapacity) }),
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

  // Create a new assignment by POSTing to /api/tables/assign. When called for
  // an unseated guest we know their invitationId so we wire it through; when
  // moving an existing assignment, the caller passes it through from the row.
  const createAssignment = useCallback(async (args: {
    tableId: string; guestName: string; invitationId: string | null;
  }) => {
    const res = await fetch('/api/tables/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
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
      const ok = await createAssignment({
        tableId: selectedTable.id,
        guestName: guest.name,
        invitationId: guest.invitationId,
      });
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
        await createAssignment({
          tableId: selectedTable.id,
          guestName: g.name,
          invitationId,
        });
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

  // Move an existing assignment to a different table. Implemented as
  // delete + create since the API doesn't support patching tableId. We
  // snapshot the name/invitationId from the assignment row before deleting.
  const handleMoveAssignment = async (assignment: TableAssignment, toTableId: string) => {
    if (!selectedTable) return;
    setSaving(true);
    try {
      const removed = await deleteAssignment(assignment.id);
      if (!removed) return;
      await createAssignment({
        tableId: toTableId,
        guestName: assignment.guestName,
        invitationId: assignment.invitationId,
      });
      await fetchAll();
      await refreshSelectedTable(selectedTable.id);
    } catch (error) {
      console.error('Failed to move assignment:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading seating chart...</p></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Seating Chart</h1>

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
                      <p className="font-medium">{table.name}</p>
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
                  <CardTitle>{selectedTable.name}</CardTitle>
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
                        <div key={assignment.id} className="flex items-center gap-2 py-2 px-3 bg-gray-50 rounded">
                          <span className="flex-1 text-sm">{assignment.guestName}</span>
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
                              <option key={t.id} value={t.id}>{t.name}</option>
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
                <UnseatedList guests={unseatedGuests} saving={false} />
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
                  placeholder="e.g. Table 1, Head Table"
                />
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

// Unseated guests grouped by household. Households with 2+ unseated members
// get a "seat whole household" shortcut, which is the most common case for
// wedding seating. onAssignOne/onAssignHousehold are only wired when a table
// is selected; otherwise the list is purely informational.
function UnseatedList({
  guests,
  onAssignOne,
  onAssignHousehold,
  saving,
}: {
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
                <span className="flex-1 text-sm">{g.name}</span>
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
