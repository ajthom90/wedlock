'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface RsvpOption {
  id: string;
  type: string;
  label: string;
  choices: string;
  required: boolean;
  order: number;
}

type ChoiceRow = { name: string; description: string };

// Parse the stored choices JSON, tolerating both legacy string[] and the new
// [{ name, description? }] shape. Always returns rows with both fields so the
// admin form can edit them uniformly.
function parseChoiceRows(raw: string): ChoiceRow[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [{ name: '', description: '' }];
    const rows = parsed
      .map((c: unknown): ChoiceRow | null => {
        if (typeof c === 'string') return c.trim() ? { name: c.trim(), description: '' } : null;
        if (c && typeof c === 'object') {
          const r = c as { name?: unknown; description?: unknown };
          const name = typeof r.name === 'string' ? r.name.trim() : '';
          const description = typeof r.description === 'string' ? r.description : '';
          return name ? { name, description } : null;
        }
        return null;
      })
      .filter((r): r is ChoiceRow => r !== null);
    return rows.length ? rows : [{ name: '', description: '' }];
  } catch {
    return [{ name: '', description: '' }];
  }
}

export default function RsvpConfigPage() {
  const [options, setOptions] = useState<RsvpOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [type, setType] = useState('meal');
  const [label, setLabel] = useState('');
  const [choiceRows, setChoiceRows] = useState<ChoiceRow[]>([{ name: '', description: '' }]);
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/rsvp-options');
      if (res.ok) {
        const data = await res.json();
        setOptions(data);
      }
    } catch (error) {
      console.error('Failed to fetch RSVP options:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const resetForm = () => {
    setType('meal');
    setLabel('');
    setChoiceRows([{ name: '', description: '' }]);
    setRequired(false);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (opt: RsvpOption) => {
    setEditingId(opt.id);
    setType(opt.type);
    setLabel(opt.label);
    setChoiceRows(parseChoiceRows(opt.choices));
    setRequired(opt.required);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const cleanedChoices = choiceRows
        .map((r) => ({ name: r.name.trim(), description: r.description.trim() }))
        .filter((r) => r.name)
        .map((r) => (r.description ? r : { name: r.name }));
      const body = {
        type,
        label: label.trim(),
        choices: cleanedChoices,
        required,
        order: editingId ? options.find((o) => o.id === editingId)?.order || 0 : options.length,
      };
      const url = editingId ? `/api/rsvp-options/${editingId}` : '/api/rsvp-options';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        setShowModal(false);
        resetForm();
        await fetchOptions();
      }
    } catch (error) {
      console.error('Failed to save option:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/rsvp-options/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteId(null);
        await fetchOptions();
      }
    } catch (error) {
      console.error('Failed to delete option:', error);
    }
  };

  const getTypeBadge = (t: string) => {
    const colors: Record<string, string> = {
      meal: 'bg-blue-100 text-blue-800',
      dietary: 'bg-green-100 text-green-800',
      custom: 'bg-purple-100 text-purple-800',
      textarea: 'bg-amber-100 text-amber-800',
    };
    const labels: Record<string, string> = { textarea: 'free-text' };
    return <span className={`px-2 py-1 text-xs rounded-full ${colors[t] || 'bg-gray-100 text-gray-800'}`}>{labels[t] || t}</span>;
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading RSVP options...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">RSVP Configuration</h1>
        <Button onClick={openCreate}>Add Option</Button>
      </div>

      <p className="text-sm text-gray-500">
        Configure the questions that appear on the RSVP form. Choices should be comma-separated.
      </p>

      <div className="space-y-3">
        {options.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">No RSVP options configured yet</CardContent>
          </Card>
        ) : (
          options.sort((a, b) => a.order - b.order).map((opt) => (
            <Card key={opt.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{opt.label}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      {getTypeBadge(opt.type)}
                      {opt.required && <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Required</span>}
                    </div>
                  </div>
                </div>
              </CardHeader>
              {opt.type === 'textarea' ? (
                <CardContent>
                  <p className="text-sm text-gray-500 italic">Guests write their own answer in a free-text box.</p>
                </CardContent>
              ) : opt.choices && (
                <CardContent>
                  <p className="text-sm font-medium text-gray-600 mb-1">Choices</p>
                  <ul className="space-y-1">
                    {parseChoiceRows(opt.choices).filter((r) => r.name).map((r) => (
                      <li key={r.name} className="text-sm text-gray-600">
                        <span className="font-medium">{r.name}</span>
                        {r.description && <span className="text-gray-500"> — {r.description}</span>}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              )}
              <CardFooter className="gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(opt)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => setDeleteId(opt.id)}>Delete</Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>{editingId ? 'Edit RSVP Option' : 'Add RSVP Option'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="meal">Meal</option>
                  <option value="dietary">Dietary</option>
                  <option value="custom">Custom</option>
                  <option value="textarea">Free-text (large box)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Label *</label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., Meal Preference" />
              </div>
              {/* Free-text options have no preset choices — guests write their own answer. */}
              {type !== 'textarea' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Choices</label>
                  <p className="text-xs text-gray-500 mb-2">
                    Add one row per option.
                    {type === 'meal' && ' Description is optional — if set, guests see it alongside the meal name in a menu block on the RSVP form.'}
                  </p>
                  <div className="space-y-2">
                    {choiceRows.map((row, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <Input
                          className={type === 'meal' ? 'w-40 shrink-0' : 'flex-1'}
                          value={row.name}
                          placeholder={type === 'meal' ? 'Name (e.g. Chicken)' : 'Choice'}
                          onChange={(e) => setChoiceRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)))}
                        />
                        {/* Per-choice descriptions are only surfaced to guests for meal options (rendered as a menu block). For other types the extra column is noise. */}
                        {type === 'meal' && (
                          <Input
                            value={row.description}
                            placeholder="Description (optional)"
                            onChange={(e) => setChoiceRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, description: e.target.value } : r)))}
                          />
                        )}
                        {choiceRows.length > 1 && (
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => setChoiceRows((rows) => rows.filter((_, idx) => idx !== i))}
                          >Remove</Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    className="mt-2"
                    onClick={() => setChoiceRows((rows) => [...rows, { name: '', description: '' }])}
                  >Add choice</Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="required"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="required" className="text-sm font-medium">Required</label>
              </div>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !label.trim()}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Confirm Delete</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Are you sure you want to delete this RSVP option?</p>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
