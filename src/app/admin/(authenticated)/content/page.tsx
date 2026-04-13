'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

interface PageContent {
  id: string;
  slug: string;
  title: string;
  content: string;
  updatedAt: string;
}

interface HotelInfo {
  name: string;
  address: string;
  phone: string;
  notes: string;
  url: string;
}

interface OurStoryContent {
  story: string;
}

interface DetailsContent {
  schedule: string;
  dressCode: string;
}

interface TravelContent {
  travelInfo: string;
  hotels: HotelInfo[];
}

const TABS = [
  { slug: 'our-story', label: 'Our Story' },
  { slug: 'details', label: 'Details' },
  { slug: 'travel', label: 'Travel' },
];

export default function ContentPage() {
  const [pages, setPages] = useState<PageContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('our-story');
  const [saving, setSaving] = useState(false);

  // Our Story fields
  const [story, setStoryText] = useState('');

  // Details fields
  const [schedule, setSchedule] = useState('');
  const [dressCode, setDressCode] = useState('');

  // Travel fields
  const [travelInfo, setTravelInfo] = useState('');
  const [hotels, setHotels] = useState<HotelInfo[]>([]);

  const loadTabData = useCallback((pageData: PageContent[], tab: string) => {
    const page = pageData.find((p) => p.slug === tab);
    if (!page) return;

    try {
      const content = JSON.parse(page.content);
      switch (tab) {
        case 'our-story': {
          const data = content as OurStoryContent;
          setStoryText(data.story || '');
          break;
        }
        case 'details': {
          const data = content as DetailsContent;
          setSchedule(data.schedule || '');
          setDressCode(data.dressCode || '');
          break;
        }
        case 'travel': {
          const data = content as TravelContent;
          setTravelInfo(data.travelInfo || '');
          setHotels(data.hotels || []);
          break;
        }
      }
    } catch {
      // Content may be plain text
      if (tab === 'our-story') setStoryText(page.content || '');
    }
  }, []);

  const fetchPages = useCallback(async () => {
    try {
      const res = await fetch('/api/pages');
      if (res.ok) {
        const data = await res.json();
        setPages(data);
        loadTabData(data, activeTab);
      }
    } catch (error) {
      console.error('Failed to fetch pages:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, loadTabData]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const switchTab = (tab: string) => {
    setActiveTab(tab);
    loadTabData(pages, tab);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let content: OurStoryContent | DetailsContent | TravelContent;
      let title: string;

      switch (activeTab) {
        case 'our-story':
          title = 'Our Story';
          content = { story };
          break;
        case 'details':
          title = 'Details';
          content = { schedule, dressCode };
          break;
        case 'travel':
          title = 'Travel';
          content = { travelInfo, hotels };
          break;
        default:
          return;
      }

      const body = { slug: activeTab, title, content };

      const res = await fetch('/api/pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await fetchPages();
      }
    } catch (error) {
      console.error('Failed to save content:', error);
    } finally {
      setSaving(false);
    }
  };

  const addHotel = () => {
    setHotels([...hotels, { name: '', address: '', phone: '', notes: '', url: '' }]);
  };

  const removeHotel = (index: number) => {
    setHotels(hotels.filter((_, i) => i !== index));
  };

  const updateHotel = (index: number, field: keyof HotelInfo, value: string) => {
    const updated = [...hotels];
    updated[index] = { ...updated[index], [field]: value };
    setHotels(updated);
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading content...</p></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Content Editor</h1>

      <div className="flex gap-2 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.slug}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.slug
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => switchTab(tab.slug)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 py-6">
          {activeTab === 'our-story' && (
            <div>
              <label className="block text-sm font-medium mb-1">Story Text</label>
              <Textarea
                value={story}
                onChange={(e) => setStoryText(e.target.value)}
                placeholder="Tell your love story..."
                className="min-h-[300px]"
              />
            </div>
          )}

          {activeTab === 'details' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Schedule</label>
                <Textarea
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  placeholder="Ceremony at 4:00 PM, Reception to follow..."
                  className="min-h-[200px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Dress Code</label>
                <Input
                  value={dressCode}
                  onChange={(e) => setDressCode(e.target.value)}
                  placeholder="e.g., Formal, Semi-Formal, Cocktail"
                />
              </div>
            </>
          )}

          {activeTab === 'travel' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Travel Information</label>
                <Textarea
                  value={travelInfo}
                  onChange={(e) => setTravelInfo(e.target.value)}
                  placeholder="Information about getting to the venue..."
                  className="min-h-[150px]"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">Hotels</label>
                  <Button size="sm" variant="outline" onClick={addHotel}>Add Hotel</Button>
                </div>
                <div className="space-y-4">
                  {hotels.map((hotel, i) => (
                    <Card key={i} className="p-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-500">Hotel {i + 1}</span>
                          <Button size="sm" variant="danger" onClick={() => removeHotel(i)}>Remove</Button>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Name</label>
                          <Input value={hotel.name} onChange={(e) => updateHotel(i, 'name', e.target.value)} placeholder="Hotel name" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Address</label>
                          <Input value={hotel.address} onChange={(e) => updateHotel(i, 'address', e.target.value)} placeholder="Hotel address" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Phone</label>
                          <Input value={hotel.phone} onChange={(e) => updateHotel(i, 'phone', e.target.value)} placeholder="Phone number" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Website URL</label>
                          <Input value={hotel.url} onChange={(e) => updateHotel(i, 'url', e.target.value)} placeholder="https://..." />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Notes</label>
                          <Input value={hotel.notes} onChange={(e) => updateHotel(i, 'notes', e.target.value)} placeholder="e.g., Use code WEDDING for discount" />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
