import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export default async function OurStoryPage() {
  const page = await prisma.page.findUnique({ where: { slug: 'our-story' } });
  let content: any = null;
  if (page?.content) { try { content = JSON.parse(page.content); } catch { content = null; } }
  const photos = await prisma.photo.findMany({ where: { gallerySection: 'us' }, orderBy: { order: 'asc' } });
  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">Our Story</h1>
      <div className="max-w-3xl mx-auto">
        {content?.story ? <div className="text-foreground/80 whitespace-pre-line text-center mb-12">{content.story}</div> : <p className="text-center text-foreground/60 mb-12">Our story coming soon!</p>}
        {photos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {photos.map((photo: { id: string; url: string; caption: string | null }) => (<div key={photo.id} className="rounded-lg overflow-hidden"><img src={photo.url} alt={photo.caption || ''} className="w-full h-64 object-cover" />{photo.caption && <p className="text-sm text-foreground/60 mt-2 text-center">{photo.caption}</p>}</div>))}
          </div>
        )}
      </div>
    </div>
  );
}
