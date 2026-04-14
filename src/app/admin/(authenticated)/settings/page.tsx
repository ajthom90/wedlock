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

  const addRegistryLink = () => {
    setSettings({
      ...settings,
      registryLinks: [...settings.registryLinks, { name: '', url: '' }],
    });
    setSaved(false);
  };

  const removeRegistryLink = (index: number) => {
    setSettings({
      ...settings,
      registryLinks: settings.registryLinks.filter((_, i) => i !== index),
    });
    setSaved(false);
  };

  const updateRegistryLink = (index: number, field: keyof RegistryLink, value: string) => {
    const updated = [...settings.registryLinks];
    updated[index] = { ...updated[index], [field]: value };
    setSettings({ ...settings, registryLinks: updated });
    setSaved(false);
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
          <p className="text-sm text-gray-500">Manage event dates and venues in the Events section.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Home Banner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload banner photos under <strong>Photos</strong> with <em>Gallery Section</em> set to <code className="bg-gray-100 px-1 rounded">home-banner</code>. They&apos;ll cross-fade on the home page.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors ${settings.homeBannerStyle === 'strip' ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="homeBannerStyle"
                  value="strip"
                  checked={settings.homeBannerStyle === 'strip'}
                  onChange={() => update('homeBannerStyle', 'strip')}
                  className="h-4 w-4"
                />
                <span className="font-medium">Strip above text</span>
              </div>
              <svg viewBox="0 0 200 120" className="w-full" role="img" aria-label="Strip layout preview">
                <rect x="0" y="0" width="200" height="120" fill="#f9fafb" />
                <rect x="10" y="10" width="180" height="40" fill="#d1d5db" />
                <text x="100" y="75" textAnchor="middle" fontSize="10" fill="#374151">We&apos;re Getting Married</text>
                <text x="100" y="92" textAnchor="middle" fontSize="8" fill="#6b7280">[ RSVP Now ]</text>
              </svg>
              <p className="text-xs text-gray-500">Photos sit above the hero text in their own block.</p>
            </label>

            <label className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors ${settings.homeBannerStyle === 'hero' ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="homeBannerStyle"
                  value="hero"
                  checked={settings.homeBannerStyle === 'hero'}
                  onChange={() => update('homeBannerStyle', 'hero')}
                  className="h-4 w-4"
                />
                <span className="font-medium">Photo behind text</span>
              </div>
              <svg viewBox="0 0 200 120" className="w-full" role="img" aria-label="Hero layout preview">
                <rect x="0" y="0" width="200" height="120" fill="#d1d5db" />
                <rect x="0" y="0" width="200" height="120" fill="#000" opacity="0.3" />
                <text x="100" y="55" textAnchor="middle" fontSize="10" fill="#fff">We&apos;re Getting Married</text>
                <text x="100" y="75" textAnchor="middle" fontSize="8" fill="#fff">[ RSVP Now ]</text>
              </svg>
              <p className="text-xs text-gray-500">Photos fill the hero with text overlaid on top.</p>
            </label>
          </div>
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
          <div className="flex justify-between items-center">
            <CardTitle>Registry Links</CardTitle>
            <Button size="sm" variant="outline" onClick={addRegistryLink}>Add Link</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.registryLinks.length === 0 ? (
            <p className="text-sm text-gray-500">No registry links added yet</p>
          ) : (
            settings.registryLinks.map((link, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    value={link.name}
                    onChange={(e) => updateRegistryLink(i, 'name', e.target.value)}
                    placeholder="Registry name"
                  />
                  <Input
                    value={link.url}
                    onChange={(e) => updateRegistryLink(i, 'url', e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <Button size="sm" variant="danger" onClick={() => removeRegistryLink(i)}>Remove</Button>
              </div>
            ))
          )}
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
