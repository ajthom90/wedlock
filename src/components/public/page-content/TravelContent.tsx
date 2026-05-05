import { RichContent } from '@/components/public/RichContent';
import type { PageRecord } from '@/lib/page-routing';

interface Hotel {
  name: string;
  address?: string;
  phone?: string;
  notes?: string;
  url?: string;
}

interface TravelData {
  travelInfo?: string;
  hotels?: Hotel[];
}

export function TravelContent({ pageRow }: { pageRow: PageRecord }) {
  let content: TravelData | null = null;
  if (pageRow.content) {
    try { content = JSON.parse(pageRow.content); } catch { content = null; }
  }
  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">{pageRow.title}</h1>
      <div className="max-w-3xl mx-auto space-y-12">
        {content?.travelInfo && (
          <section>
            <RichContent html={content.travelInfo} className="rich-content text-foreground/80" />
          </section>
        )}
        {content?.hotels && content.hotels.length > 0 && (
          <section>
            <h2 className="text-2xl font-heading font-semibold text-center mb-8">Where to Stay</h2>
            <div className="grid gap-6">
              {content.hotels.map((hotel, i) => (
                <div key={i} className="border border-foreground/10 rounded-lg p-6">
                  <h3 className="text-xl font-heading font-semibold mb-2">{hotel.name}</h3>
                  {hotel.address && <p className="text-foreground/70 mb-2">{hotel.address}</p>}
                  {hotel.phone && <p className="text-foreground/70 mb-2">Phone: {hotel.phone}</p>}
                  {hotel.notes && <p className="text-foreground/70 mb-2">{hotel.notes}</p>}
                  {hotel.url && (
                    <a href={hotel.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Book Now
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        {!content && (
          <div className="text-center text-foreground/60 py-8">
            <p>Travel information coming soon!</p>
            <p className="text-sm mt-2">Check back later for accommodation details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
