'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

// Must stay in sync with FeatureSettings in lib/settings.ts.
interface FeatureSettings {
  perGuestSelection: boolean;
  songRequests: boolean;
  dietaryNotes: boolean;
  plusOnes: boolean;
  rsvpAddress: boolean;
  weatherWidget: boolean;
  storyTimeline: boolean;
  transportation: boolean;
  honeymoonFund: boolean;
  photoWall: boolean;
  trivia: boolean;
  guestPhotoUpload: boolean;
  guestBook: string;
  vendorContacts: boolean;
  budgetTracker: boolean;
  sitePasswordEnabled: boolean;
}

type BoolFeature = Exclude<keyof FeatureSettings, 'guestBook'>;

const DEFAULTS: FeatureSettings = {
  perGuestSelection: true,
  songRequests: true,
  dietaryNotes: true,
  plusOnes: false,
  rsvpAddress: true,
  weatherWidget: true,
  storyTimeline: true,
  transportation: true,
  honeymoonFund: true,
  photoWall: true,
  trivia: true,
  guestPhotoUpload: false,
  guestBook: 'off',
  vendorContacts: true,
  budgetTracker: true,
  sitePasswordEnabled: false,
};

interface ToggleDescriptor {
  key: BoolFeature;
  label: string;
  description: string;
}

// Grouped so the admin page mirrors the mental model: what does the couple
// see, what do guests see, what do I see when I'm managing things?
const GUEST_FACING: ToggleDescriptor[] = [
  { key: 'weatherWidget', label: 'Weather forecast',
    description: 'Show a live forecast below the homepage countdown in the final 16 days (needs venue lat/lng in Settings).' },
  { key: 'storyTimeline', label: 'How-we-met timeline',
    description: 'Render the relationship-milestone timeline on the Our Story page.' },
  { key: 'transportation', label: 'Transportation / shuttles',
    description: 'Publish the Transportation page where invited guests sign up for shuttle seats.' },
  { key: 'honeymoonFund', label: 'Honeymoon fund',
    description: 'Show honeymoon-fund experiences alongside the registry and let guests pledge amounts.' },
  { key: 'photoWall', label: 'Live photo wall',
    description: 'Enable the /wall reception display and QR-coded /wall/upload page (also requires guest photo uploads).' },
  { key: 'trivia', label: 'Trivia game',
    description: 'Show the /trivia page so guests can play a multiple-choice game about the couple.' },
  { key: 'guestPhotoUpload', label: 'Guest photo uploads',
    description: 'Let guests upload photos for moderation (also required for the live photo wall).' },
];

const RSVP_FIELDS: ToggleDescriptor[] = [
  { key: 'perGuestSelection', label: 'Per-guest meal selection',
    description: 'Let guests pick a meal choice for each attendee individually.' },
  { key: 'plusOnes', label: 'Plus-one support',
    description: 'Let guests add a plus-one not on the invitation.' },
  { key: 'songRequests', label: 'Song requests',
    description: 'Let guests suggest songs during the RSVP flow.' },
  { key: 'dietaryNotes', label: 'Dietary notes',
    description: 'Let guests add dietary restrictions or allergy notes.' },
  { key: 'rsvpAddress', label: 'Mailing address',
    description: 'Ask for a mailing address — useful for save-the-dates and thank-you cards.' },
];

const ADMIN_TOOLS: ToggleDescriptor[] = [
  { key: 'vendorContacts', label: 'Vendor contacts',
    description: 'Keep the private Vendors admin page. Turning this off just hides the sidebar item — data is preserved.' },
  { key: 'budgetTracker', label: 'Budget tracker',
    description: 'Keep the private Budget admin page. Data is preserved when hidden.' },
];

const SITE_ACCESS: ToggleDescriptor[] = [
  { key: 'sitePasswordEnabled', label: 'Site password',
    description: 'Require visitors to enter a password before viewing the public site (configure the password in Settings).' },
];

export default function FeaturesPage() {
  const [features, setFeatures] = useState<FeatureSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await fetch('/api/features');
      if (res.ok) {
        const data = await res.json();
        setFeatures({ ...DEFAULTS, ...data });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

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
        setFeatures({ ...DEFAULTS, ...(await res.json()) });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: BoolFeature) => {
    setFeatures((f) => ({ ...f, [key]: !f[key] }));
    setSaved(false);
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading features...</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Features</h1>
        <p className="text-sm text-gray-500 mt-1">
          Turn modules on and off. When off, the matching page and sidebar entry are hidden from everyone.
          Your data is never deleted — re-enable anytime to bring it back.
        </p>
      </div>

      <Section title="On the public site" features={features} toggles={GUEST_FACING} onToggle={toggle} />
      <Section title="In the RSVP form" features={features} toggles={RSVP_FIELDS} onToggle={toggle} />

      <Card>
        <CardHeader>
          <CardTitle>Guest Book</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(['off', 'public', 'moderated'] as const).map((mode) => (
            <label key={mode} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="guestBook"
                value={mode}
                checked={features.guestBook === mode}
                onChange={() => { setFeatures({ ...features, guestBook: mode }); setSaved(false); }}
                className="h-4 w-4 mt-1"
              />
              <div>
                <p className="font-medium capitalize">{mode}</p>
                <p className="text-sm text-gray-500">
                  {mode === 'off' && 'Guest book is hidden entirely.'}
                  {mode === 'public' && 'All entries appear immediately.'}
                  {mode === 'moderated' && 'Entries wait for your approval before appearing.'}
                </p>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      <Section title="Admin tools" features={features} toggles={ADMIN_TOOLS} onToggle={toggle} />
      <Section title="Site access" features={features} toggles={SITE_ACCESS} onToggle={toggle} />

      <div className="flex items-center gap-4 justify-end sticky bottom-4">
        {saved && <span className="text-sm text-green-600">✓ Saved</span>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  features,
  toggles,
  onToggle,
}: {
  title: string;
  features: FeatureSettings;
  toggles: ToggleDescriptor[];
  onToggle: (key: BoolFeature) => void;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="divide-y divide-gray-100">
        {toggles.map((t) => (
          <div key={t.key} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div>
              <p className="font-medium">{t.label}</p>
              <p className="text-sm text-gray-500">{t.description}</p>
            </div>
            <Toggle checked={features[t.key]} onChange={() => onToggle(t.key)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}
