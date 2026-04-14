import prisma from '@/lib/prisma';
import { RichContent } from '@/components/public/RichContent';
import { Framed } from '@/components/public/Framed';

export const dynamic = 'force-dynamic';

type Milestone = Awaited<ReturnType<typeof prisma.storyMilestone.findMany>>[number];

export default async function OurStoryPage() {
  const [page, photos, milestones] = await Promise.all([
    prisma.page.findUnique({ where: { slug: 'our-story' } }),
    prisma.photo.findMany({ where: { gallerySection: 'us' }, orderBy: { order: 'asc' } }),
    prisma.storyMilestone.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
  ]);

  let content: { story?: string } | null = null;
  if (page?.content) {
    try { content = JSON.parse(page.content); } catch { content = null; }
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">Our Story</h1>
      <div className="max-w-3xl mx-auto">
        {content?.story ? (
          <RichContent html={content.story} className="rich-content text-foreground/80 mb-12" />
        ) : (
          !milestones.length && <p className="text-center text-foreground/60 mb-12">Our story coming soon!</p>
        )}

        {milestones.length > 0 && <StoryTimeline milestones={milestones} />}

        {photos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
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

// Vertical timeline with alternating left/right cards on md+, stacked on mobile.
// Each milestone anchors to a central line with a circular marker.
function StoryTimeline({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="relative my-12">
      {/* Vertical spine */}
      <div
        className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-primary/20 md:-translate-x-px"
        aria-hidden="true"
      />
      <ol className="space-y-10">
        {milestones.map((m, i) => (
          <li
            key={m.id}
            className={`relative pl-12 md:pl-0 md:grid md:grid-cols-2 md:gap-12 ${
              i % 2 === 0 ? '' : 'md:[&>div]:col-start-2'
            }`}
          >
            {/* Marker */}
            <span
              className="absolute top-3 left-2 md:left-1/2 md:-translate-x-1/2 h-5 w-5 rounded-full bg-primary ring-4 ring-background shadow-sm"
              aria-hidden="true"
            />
            <div className={i % 2 === 0 ? 'md:text-right md:pr-8' : 'md:pl-8'}>
              <p className="text-sm uppercase tracking-wider text-primary/80 font-medium mb-1">{m.date}</p>
              <h3 className="text-xl font-heading font-semibold mb-2">{m.title}</h3>
              {m.imageUrl && (
                <div className={`rounded-lg overflow-hidden aspect-video bg-secondary/20 mb-3 ${i % 2 === 0 ? 'md:ml-auto' : ''}`}>
                  <Framed
                    src={m.imageUrl}
                    alt={m.title}
                    focalX={m.focalX}
                    focalY={m.focalY}
                    zoom={m.zoom}
                  />
                </div>
              )}
              {m.description && (
                <p className="text-foreground/70 leading-relaxed whitespace-pre-line">{m.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
