'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface TableAssignment {
  id: string;
  guestName: string;
}

interface Table {
  id: string;
  name: string;
  capacity: number;
  assignments: TableAssignment[];
}

interface Guest {
  id: string;
  name: string;
}

export default function SeatingPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [unseatedGuests, setUnseatedGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('8');
  const [newGuestName, setNewGuestName] = useState('');
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
        // Both need to appear in the unseated list until they're assigned.
        type InvitationFromApi = {
          id: string;
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

        const attendingGuests: Guest[] = [];
        (invitations as InvitationFromApi[]).forEach((inv) => {
          if (inv.response?.attending !== 'yes') return;

          const guestsById = new Map(inv.guests.map((g) => [g.id, g.name]));
          const attendingIds = safeParse<string[]>(inv.response.attendingGuests, []);
          attendingIds.forEach((id) => {
            const name = guestsById.get(id) ?? id;
            if (!assignedNames.has(name.toLowerCase())) {
              attendingGuests.push({ id: `${inv.id}-${id}`, name });
            }
          });

          const pluses = safeParse<{ name: string }[]>(inv.response.plusOnes, []);
          pluses.forEach((p, idx) => {
            if (!p?.name) return;
            if (!assignedNames.has(p.name.toLowerCase())) {
              attendingGuests.push({ id: `${inv.id}-plusone-${idx}`, name: p.name });
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

  const handleAddAssignment = async () => {
    if (!selectedTable || !newGuestName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tables/${selectedTable.id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestName: newGuestName.trim() }),
      });
      if (res.ok) {
        setNewGuestName('');
        await fetchAll();
        const updatedTablesRes = await fetch('/api/tables');
        if (updatedTablesRes.ok) {
          const updatedTables = await updatedTablesRes.json();
          const updated = updatedTables.find((t: Table) => t.id === selectedTable.id);
          if (updated) setSelectedTable(updated);
        }
      }
    } catch (error) {
      console.error('Failed to add assignment:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!selectedTable) return;
    try {
      const res = await fetch(`/api/tables/${selectedTable.id}/assignments/${assignmentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchAll();
        const updatedTablesRes = await fetch('/api/tables');
        if (updatedTablesRes.ok) {
          const updatedTables = await updatedTablesRes.json();
          const updated = updatedTables.find((t: Table) => t.id === selectedTable.id);
          if (updated) setSelectedTable(updated);
        }
      }
    } catch (error) {
      console.error('Failed to remove assignment:', error);
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

        {/* Right side: Selected table assignments */}
        <div className="space-y-4">
          {selectedTable ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{selectedTable.name} - Assignments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={newGuestName}
                      onChange={(e) => setNewGuestName(e.target.value)}
                      placeholder="Guest name"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAssignment()}
                    />
                    <Button onClick={handleAddAssignment} disabled={saving || !newGuestName.trim()}>
                      Add
                    </Button>
                  </div>

                  {selectedTable.assignments?.length === 0 ? (
                    <p className="text-sm text-gray-500">No guests assigned to this table yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedTable.assignments?.map((assignment) => (
                        <div key={assignment.id} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
                          <span className="text-sm">{assignment.guestName}</span>
                          <Button size="sm" variant="danger" onClick={() => handleRemoveAssignment(assignment.id)}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-500">Select a table to manage its seating assignments.</p>
              </CardContent>
            </Card>
          )}

          {/* Unseated guests */}
          <Card>
            <CardHeader>
              <CardTitle>Unseated Guests</CardTitle>
            </CardHeader>
            <CardContent>
              {unseatedGuests.length === 0 ? (
                <p className="text-sm text-gray-500">All attending guests have been assigned to a table.</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-gray-500 mb-2">{unseatedGuests.length} guest(s) still need seating:</p>
                  {unseatedGuests.map((guest) => (
                    <div key={guest.id} className="py-1 px-3 bg-yellow-50 rounded text-sm">
                      {guest.name}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
