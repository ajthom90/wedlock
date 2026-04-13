'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface ThemeSettings {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  foregroundColor: string;
  headingFont: string;
  bodyFont: string;
}

interface CustomFont {
  id: string;
  name: string;
  family: string;
}

const GOOGLE_FONTS = [
  'Playfair Display',
  'Lato',
  'Montserrat',
  'Open Sans',
  'Roboto',
  'Cormorant Garamond',
  'Great Vibes',
  'Dancing Script',
  'Raleway',
  'Merriweather',
  'Oswald',
  'Poppins',
  'Libre Baskerville',
  'Josefin Sans',
  'Crimson Text',
];

function rgbToHex(rgbStr: string): string {
  const parts = rgbStr.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '#000000';
  return '#' + parts.map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0 0';
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

export default function ThemePage() {
  const [theme, setTheme] = useState<ThemeSettings>({
    primaryColor: '139 90 43',
    secondaryColor: '180 148 115',
    accentColor: '212 175 55',
    backgroundColor: '255 253 250',
    foregroundColor: '55 48 42',
    headingFont: 'Playfair Display',
    bodyFont: 'Lato',
  });
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchTheme = useCallback(async () => {
    try {
      const [settingsRes, fontsRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/fonts'),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.theme) setTheme(data.theme);
      }
      if (fontsRes.ok) {
        const data = await fontsRes.json();
        setCustomFonts(data);
      }
    } catch (error) {
      console.error('Failed to fetch theme:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTheme();
  }, [fetchTheme]);

  const updateColor = (key: keyof ThemeSettings, hexValue: string) => {
    setTheme({ ...theme, [key]: hexToRgb(hexValue) });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });
      if (res.ok) {
        setSaved(true);
      }
    } catch (error) {
      console.error('Failed to save theme:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading theme...</p></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Theme</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Colors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Colors are stored as RGB triplets (e.g., &quot;139 90 43&quot;). Use the color picker or enter values directly.
            </p>
            {([
              { key: 'primaryColor' as const, label: 'Primary' },
              { key: 'secondaryColor' as const, label: 'Secondary' },
              { key: 'accentColor' as const, label: 'Accent' },
              { key: 'backgroundColor' as const, label: 'Background' },
              { key: 'foregroundColor' as const, label: 'Foreground' },
            ]).map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={rgbToHex(theme[key])}
                  onChange={(e) => updateColor(key, e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                />
                <div className="flex-1">
                  <label className="block text-sm font-medium">{label}</label>
                  <Input
                    value={theme[key]}
                    onChange={(e) => {
                      setTheme({ ...theme, [key]: e.target.value });
                      setSaved(false);
                    }}
                    placeholder="R G B"
                    className="mt-1"
                  />
                </div>
                <div
                  className="w-10 h-10 rounded border border-gray-300 shrink-0"
                  style={{ backgroundColor: `rgb(${theme[key].replace(/\s+/g, ',')})` }}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fonts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Heading Font</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={theme.headingFont}
                onChange={(e) => {
                  setTheme({ ...theme, headingFont: e.target.value });
                  setSaved(false);
                }}
              >
                <optgroup label="Google Fonts">
                  {GOOGLE_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </optgroup>
                {customFonts.length > 0 && (
                  <optgroup label="Custom Fonts">
                    {customFonts.map((f) => (
                      <option key={f.id} value={f.family}>{f.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Body Font</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={theme.bodyFont}
                onChange={(e) => {
                  setTheme({ ...theme, bodyFont: e.target.value });
                  setSaved(false);
                }}
              >
                <optgroup label="Google Fonts">
                  {GOOGLE_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </optgroup>
                {customFonts.length > 0 && (
                  <optgroup label="Custom Fonts">
                    {customFonts.map((f) => (
                      <option key={f.id} value={f.family}>{f.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="rounded-lg p-8 border"
            style={{
              backgroundColor: `rgb(${theme.backgroundColor.replace(/\s+/g, ',')})`,
              color: `rgb(${theme.foregroundColor.replace(/\s+/g, ',')})`,
            }}
          >
            <h2
              className="text-3xl mb-4"
              style={{ fontFamily: `"${theme.headingFont}", serif`, color: `rgb(${theme.primaryColor.replace(/\s+/g, ',')})` }}
            >
              Wedding Invitation
            </h2>
            <p
              className="mb-4"
              style={{ fontFamily: `"${theme.bodyFont}", sans-serif` }}
            >
              You are cordially invited to celebrate the marriage of our beloved couple.
            </p>
            <div className="flex gap-3">
              <span
                className="inline-block px-4 py-2 rounded text-white text-sm"
                style={{ backgroundColor: `rgb(${theme.primaryColor.replace(/\s+/g, ',')})` }}
              >
                Primary Button
              </span>
              <span
                className="inline-block px-4 py-2 rounded text-white text-sm"
                style={{ backgroundColor: `rgb(${theme.secondaryColor.replace(/\s+/g, ',')})` }}
              >
                Secondary
              </span>
              <span
                className="inline-block px-4 py-2 rounded text-white text-sm"
                style={{ backgroundColor: `rgb(${theme.accentColor.replace(/\s+/g, ',')})` }}
              >
                Accent
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 justify-end">
        {saved && <span className="text-sm text-green-600">Theme saved successfully!</span>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Theme'}
        </Button>
      </div>
    </div>
  );
}
