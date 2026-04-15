'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface RegistryLink {
  name: string;
  url: string;
}

interface SiteSettings {
  coupleName1: string;
  coupleName2: string;
  weddingDate: string;
  weddingTime: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
  rsvpDeadline: string;
  rsvpCloseAfterDeadline: boolean;
  registryLinks: RegistryLink[];
  qrCardWidth: number;
  qrCardHeight: number;
  sitePassword: string;
  homeBannerStyle: 'hero' | 'strip';
  siteTitle: string;
  siteDescription: string;
  venueLat: string;
  venueLng: string;
  eventsDisplayStyle: 'list' | 'timeline';
  weddingPartyLeftSide: 'bride' | 'groom';
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>({
    coupleName1: '',
    coupleName2: '',
    weddingDate: '',
    weddingTime: '',
    venueName: '',
    venueAddress: '',
    mapUrl: '',
    rsvpDeadline: '',
    rsvpCloseAfterDeadline: false,
    registryLinks: [],
    qrCardWidth: 2,
    qrCardHeight: 4,
    sitePassword: '',
    homeBannerStyle: 'strip',
    siteTitle: '',
    siteDescription: '',
    venueLat: '',
    venueLng: '',
    eventsDisplayStyle: 'list',
    weddingPartyLeftSide: 'bride',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.site) setSettings(data.site);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const update = (key: keyof SiteSettings, value: string | boolean | number) => {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: settings }),
      });
      if (res.ok) {
        setSaved(true);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading settings...</p></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Couple Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Partner 1 Name</label>
              <Input
                value={settings.coupleName1}
                onChange={(e) => update('coupleName1', e.target.value)}
                placeholder="First partner's name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Partner 2 Name</label>
              <Input
                value={settings.coupleName2}
                onChange={(e) => update('coupleName2', e.target.value)}
                placeholder="Second partner's name"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Wedding Date</label>
              <Input
                type="date"
                value={settings.weddingDate}
                onChange={(e) => update('weddingDate', e.target.value)}
              />
              <p className="text-sm text-gray-500 mt-1">Used for the homepage countdown timer.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Wedding Time</label>
              <Input
                type="time"
                value={settings.weddingTime}
                onChange={(e) => update('weddingTime', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Venue Name</label>
            <Input
              value={settings.venueName}
              onChange={(e) => update('venueName', e.target.value)}
              placeholder="e.g., The Riverhouse Estate"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Venue Address</label>
            <Input
              value={settings.venueAddress}
              onChange={(e) => update('venueAddress', e.target.value)}
              placeholder="Street, City, State ZIP"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Google Maps link</label>
            <Input
              value={settings.mapUrl}
              onChange={(e) => update('mapUrl', e.target.value)}
              placeholder="https://maps.app.goo.gl/..."
            />
            <p className="text-xs text-gray-500 mt-1">Paste any Google Maps link or a venue address. We&apos;ll convert it for display.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Venue latitude</label>
              <Input
                value={settings.venueLat}
                onChange={(e) => update('venueLat', e.target.value)}
                placeholder="44.9778"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Venue longitude</label>
              <Input
                value={settings.venueLng}
                onChange={(e) => update('venueLng', e.target.value)}
                placeholder="-93.2650"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Optional — enables a weather forecast under the countdown in the final week. Right-click the venue on Google Maps, click the coordinates to copy both at once.
          </p>
          <p className="text-sm text-gray-500">Manage event dates and venues in the Events section.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Browser Tab</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tab title</label>
            <Input
              value={settings.siteTitle}
              onChange={(e) => update('siteTitle', e.target.value)}
              placeholder="Leave blank for: Joe & Alex - November 28, 2026"
            />
            <p className="text-sm text-gray-500 mt-1">
              Shown in the browser tab and bookmarks. Leave blank to auto-build from
              the couple names and wedding date above.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tab description</label>
            <Input
              value={settings.siteDescription}
              onChange={(e) => update('siteDescription', e.target.value)}
              placeholder="Join us for our special day"
            />
            <p className="text-sm text-gray-500 mt-1">
              Used by search engines and link previews when someone shares the site.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events Display</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="eventsDisplayStyle"
              value="list"
              checked={settings.eventsDisplayStyle === 'list'}
              onChange={() => update('eventsDisplayStyle', 'list')}
              className="h-4 w-4"
            />
            <span className="text-sm">List — each event in its own card, stacked vertically</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="eventsDisplayStyle"
              value="timeline"
              checked={settings.eventsDisplayStyle === 'timeline'}
              onChange={() => update('eventsDisplayStyle', 'timeline')}
              className="h-4 w-4"
            />
            <span className="text-sm">Timeline — visual vertical timeline with time markers</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wedding Party Layout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-500">Pick which side appears on the left of the two-column layout on the public Wedding Party page. Supporting Cast (officiant, ring bearer, flower girl, etc.) always renders full-width below.</p>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="weddingPartyLeftSide"
              value="bride"
              checked={settings.weddingPartyLeftSide === 'bride'}
              onChange={() => update('weddingPartyLeftSide', 'bride')}
              className="h-4 w-4"
            />
            <span className="text-sm">Bride on left, Groom on right</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="weddingPartyLeftSide"
              value="groom"
              checked={settings.weddingPartyLeftSide === 'groom'}
              onChange={() => update('weddingPartyLeftSide', 'groom')}
              className="h-4 w-4"
            />
            <span className="text-sm">Groom on left, Bride on right</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>RSVP Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">RSVP Deadline</label>
            <Input
              type="date"
              value={settings.rsvpDeadline}
              onChange={(e) => update('rsvpDeadline', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="closeAfterDeadline"
              checked={settings.rsvpCloseAfterDeadline}
              onChange={(e) => update('rsvpCloseAfterDeadline', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="closeAfterDeadline" className="text-sm font-medium">
              Close RSVP form after deadline
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Site Password Protection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Site Password</label>
            <Input
              value={settings.sitePassword}
              onChange={(e) => update('sitePassword', e.target.value)}
              placeholder="Enter a site password"
            />
            <p className="text-sm text-gray-500 mt-1">
              Set a password to require visitors to enter it before viewing the site. Leave blank to disable.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QR Card Dimensions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Set the dimensions for the QR code cards in the downloadable PDF (in inches).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Width (inches)</label>
              <Input
                type="number"
                step="0.25"
                min={1}
                max={10}
                value={settings.qrCardWidth}
                onChange={(e) => update('qrCardWidth', parseFloat(e.target.value) || 2)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Height (inches)</label>
              <Input
                type="number"
                step="0.25"
                min={1}
                max={10}
                value={settings.qrCardHeight}
                onChange={(e) => update('qrCardHeight', parseFloat(e.target.value) || 4)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 justify-end">
        {saved && <span className="text-sm text-green-600">Settings saved successfully!</span>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
