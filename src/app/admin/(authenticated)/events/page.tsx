'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Event {
  id: string;
  name: string;
  date: string;
  time: string;
  endTime: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
  description: string;
  visibility: string;
}

const emptyForm: Omit<Event, 'id'> = {
  name: '',
  date: '',
  time: '',
  endTime: '',
  venueName: '',
  venueAddress: '',
  mapUrl: '',
  description: '',
  visibility: 'public',
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const updateForm = (key: keyof typeof emptyForm, value: string) => {
    setForm({ ...form, [key]: value });
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (event: Event) => {
    setEditing(event);
    setForm({
      name: event.name,
      date: event.date,
      time: event.time,
      endTime: event.endTime,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      mapUrl: event.mapUrl,
      description: event.description,
      visibility: event.visibility || 'public',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/events/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          await fetchEvents();
          closeModal();
        }
      } else {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          await fetchEvents();
          closeModal();
        }
      }
    } catch (error) {
      console.error('Failed to save event:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchEvents();
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
    } finally {
      setDeleteConfirm(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading events...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Event Management</h1>
        <Button onClick={openAdd}>Add Event</Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">No events added yet. Click &quot;Add Event&quot; to create one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{event.name}</CardTitle>
                      {event.visibility === 'wedding-party' && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Wedding Party Only</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {event.date} {event.time && `at ${event.time}`}
                      {event.endTime && ` - ${event.endTime}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-4">
                    <Button size="sm" variant="outline" onClick={() => openEdit(event)}>Edit</Button>
                    {deleteConfirm === event.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(event.id)}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(event.id)}>Delete</Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {event.venueName && (
                  <p className="text-sm"><span className="font-medium">Venue:</span> {event.venueName}</p>
                )}
                {event.venueAddress && (
                  <p className="text-sm"><span className="font-medium">Address:</span> {event.venueAddress}</p>
                )}
                {event.description && (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{event.description}</p>
                )}
                {event.mapUrl && (
                  <p className="text-sm text-blue-600 truncate">
                    <span className="font-medium text-gray-900">Map:</span> {event.mapUrl}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{editing ? 'Edit Event' : 'Add Event'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Event Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="e.g. Ceremony, Reception"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Visibility</label>
                <select
                  value={form.visibility}
                  onChange={(e) => updateForm('visibility', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="public">Public</option>
                  <option value="wedding-party">Wedding Party Only</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateForm('date', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Start Time</label>
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => updateForm('time', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Time</label>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => updateForm('endTime', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Venue Name</label>
                <Input
                  value={form.venueName}
                  onChange={(e) => updateForm('venueName', e.target.value)}
                  placeholder="Venue name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Venue Address</label>
                <Input
                  value={form.venueAddress}
                  onChange={(e) => updateForm('venueAddress', e.target.value)}
                  placeholder="Full venue address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Google Maps link</label>
                <Input
                  value={form.mapUrl}
                  onChange={(e) => updateForm('mapUrl', e.target.value)}
                  placeholder="https://maps.app.goo.gl/..."
                />
                <p className="text-xs text-gray-500 mt-1">Paste any Google Maps link or a venue address. We&apos;ll convert it for display.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                  placeholder="Event description"
                  rows={3}
                />
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-6 pt-0">
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
