import { getSiteSettings } from '@/lib/settings';
export const dynamic = 'force-dynamic';
export default async function RegistryPage() {
  const settings = await getSiteSettings();
  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-4">Registry</h1>
      <p className="text-center text-foreground/70 mb-12 max-w-2xl mx-auto">Your presence at our wedding is the greatest gift. If you wish to honor us with a gift, we have registered at the following places.</p>
      <div className="max-w-2xl mx-auto">
        {settings.registryLinks && settings.registryLinks.length > 0 ? (
          <div className="grid gap-4">{settings.registryLinks.map((link: any, i: number) => (<a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="block p-6 border border-foreground/10 rounded-lg hover:border-primary/30 hover:shadow-md transition-all text-center"><h3 className="text-xl font-heading font-semibold">{link.name}</h3></a>))}</div>
        ) : <p className="text-center text-foreground/60">Registry information coming soon!</p>}
      </div>
    </div>
  );
}
