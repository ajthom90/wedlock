import prisma from '@/lib/prisma';
import { RichContent } from '@/components/public/RichContent';
import { Framed } from '@/components/public/Framed';

export const dynamic = 'force-dynamic';

export default async function OurStoryPage() {
  const page = await prisma.page.findUnique({ where: { slug: 'our-story' } });
  let content: any = null;
  if (page?.content) {
    try { content = JSON.parse(page.content); } catch { content = null; }
  }
  const photos = await prisma.photo.findMany({
    where: { gallerySection: 'us' },
    orderBy: { order: 'asc' },
  });

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">Our Story</h1>
      <div className="max-w-3xl mx-auto">
        {content?.story ? (
          <RichContent html={content.story} className="rich-content text-foreground/80 mb-12" />
        ) : (
          <p className="text-center text-foreground/60 mb-12">Our story coming soon!</p>
        )}
        {photos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {photos.map((photo) => (
              <div key={photo.id}>
                <div className="rounded-lg overflow-hidden h-64 bg-secondary/20">
                  <Framed
                    src={photo.url}
                    alt={photo.caption || ''}
                    focalX={photo.focalX}
                    focalY={photo.focalY}
                    zoom={photo.zoom}
                  />
                </div>
                {photo.caption && <p className="text-sm text-foreground/60 mt-2 text-center">{photo.caption}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
