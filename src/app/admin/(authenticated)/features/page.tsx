'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface FeatureSettings {
  perGuestSelection: boolean;
  songRequests: boolean;
  dietaryNotes: boolean;
  plusOnes: boolean;
  guestPhotoUpload: boolean;
  sitePasswordEnabled: boolean;
  guestBook: string;
}

export default function FeaturesPage() {
  const [features, setFeatures] = useState<FeatureSettings>({
    perGuestSelection: true,
    songRequests: true,
    dietaryNotes: true,
    plusOnes: false,
    guestPhotoUpload: false,
    sitePasswordEnabled: false,
    guestBook: 'off',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await fetch('/api/features');
      if (res.ok) {
        const data = await res.json();
        setFeatures(data);
      }
    } catch (error) {
      console.error('Failed to fetch features:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
      });
      if (res.ok) {
        const data = await res.json();
        setFeatures(data);
        setSaved(true);
      }
    } catch (error) {
      console.error('Failed to save features:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = (key: 'perGuestSelection' | 'songRequests' | 'dietaryNotes' | 'plusOnes' | 'guestPhotoUpload' | 'sitePasswordEnabled') => {
    setFeatures({ ...features, [key]: !features[key] });
    setSaved(false);
  };

  const setGuestBookMode = (mode: string) => {
    setFeatures({ ...features, guestBook: mode });
    setSaved(false);
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading features...</p></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Feature Toggles</h1>

      <Card>
        <CardHeader>
          <CardTitle>RSVP Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Per-Guest Meal Selection</p>
              <p className="text-sm text-gray-500">Allow guests to select individual meal choices for each attendee</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={features.perGuestSelection}
                onChange={() => toggleFeature('perGuestSelection')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Song Requests</p>
              <p className="text-sm text-gray-500">Allow guests to request songs on the RSVP form</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={features.songRequests}
                onChange={() => toggleFeature('songRequests')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Dietary Notes</p>
              <p className="text-sm text-gray-500">Allow guests to add dietary restrictions or notes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={features.dietaryNotes}
                onChange={() => toggleFeature('dietaryNotes')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Plus-One Support</p>
              <p className="text-sm text-gray-500">Allow guests to bring a plus-one not on the invitation</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={features.plusOnes}
                onChange={() => toggleFeature('plusOnes')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Guest Photo Uploads</p>
              <p className="text-sm text-gray-500">Allow guests to upload photos to the gallery</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={features.guestPhotoUpload}
                onChange={() => toggleFeature('guestPhotoUpload')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Site Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Site Password</p>
              <p className="text-sm text-gray-500">Require a password to access the public site</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={features.sitePasswordEnabled}
                onChange={() => toggleFeature('sitePasswordEnabled')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guest Book</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">Control how the guest book feature works on your site.</p>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="guestBook"
                value="off"
                checked={features.guestBook === 'off'}
                onChange={() => setGuestBookMode('off')}
                className="h-4 w-4 text-primary border-gray-300"
              />
              <div>
                <p className="font-medium">Off</p>
                <p className="text-sm text-gray-500">Guest book is disabled</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="guestBook"
                value="public"
                checked={features.guestBook === 'public'}
                onChange={() => setGuestBookMode('public')}
                className="h-4 w-4 text-primary border-gray-300"
              />
              <div>
                <p className="font-medium">Public</p>
                <p className="text-sm text-gray-500">All entries are automatically visible</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="guestBook"
                value="moderated"
                checked={features.guestBook === 'moderated'}
                onChange={() => setGuestBookMode('moderated')}
                className="h-4 w-4 text-primary border-gray-300"
              />
              <div>
                <p className="font-medium">Moderated</p>
                <p className="text-sm text-gray-500">Entries require approval before they are visible</p>
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 justify-end">
        {saved && <span className="text-sm text-green-600">Features saved successfully!</span>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Features'}
        </Button>
      </div>
    </div>
  );
}
