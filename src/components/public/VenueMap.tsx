import { toEmbedUrl } from '@/lib/mapUrl';

interface Props {
  mapUrl: string | null | undefined;
  title?: string;
}

export async function VenueMap({ mapUrl, title }: Props) {
  if (!mapUrl || !mapUrl.trim()) return null;

  const embedUrl = await toEmbedUrl(mapUrl);

  if (embedUrl) {
    return (
      <div className="aspect-video w-full rounded-lg overflow-hidden">
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={title || 'Venue location map'}
        />
      </div>
    );
  }

  // Fallback: couldn't parse — render a button linking to the original URL.
  return (
    <div className="text-center">
      <a
        href={mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-white hover:bg-primary/90 transition-colors"
      >
        <span aria-hidden="true">📍</span>
        <span>View on Google Maps</span>
      </a>
    </div>
  );
}
