import prisma from '@/lib/prisma';
import { getSiteSettings, getFeatures } from '@/lib/settings';
import { HoneymoonPledgeForm } from '@/components/public/HoneymoonPledgeForm';

export const dynamic = 'force-dynamic';

export default async function RegistryPage() {
  const [settings, honeymoonItemsRaw, features] = await Promise.all([
    getSiteSettings(),
    prisma.honeymoonItem.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    getFeatures(),
  ]);

  // Aggregate pledges per item so we can show progress without leaking names.
  const sums = await prisma.honeymoonPledge.groupBy({
    by: ['itemId'],
    _sum: { amount: true },
  });
  const totals = Object.fromEntries(sums.map((s) => [s.itemId, s._sum.amount || 0]));

  const honeymoonItems = features.honeymoonFund ? honeymoonItemsRaw : [];
  const hasLinks = settings.registryLinks && settings.registryLinks.length > 0;
  const hasHoneymoon = honeymoonItems.length > 0;

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-4">Registry</h1>
      <p className="text-center text-foreground/70 mb-12 max-w-2xl mx-auto">
        Your presence at our wedding is the greatest gift. If you wish to honor us with a gift,
        thank you — below are a few ways to do so.
      </p>

      <div className="max-w-3xl mx-auto space-y-16">
        {hasLinks && (
          <section>
            {hasHoneymoon && (
              <h2 className="text-2xl font-heading font-semibold text-center mb-6">Registries</h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {settings.registryLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-6 border border-foreground/10 rounded-lg hover:border-primary/30 hover:shadow-md transition-all text-center"
                >
                  <h3 className="text-xl font-heading font-semibold">{link.name}</h3>
                </a>
              ))}
            </div>
          </section>
        )}

        {hasHoneymoon && (
          <section>
            <h2 className="text-2xl font-heading font-semibold text-center mb-2">Honeymoon Fund</h2>
            <p className="text-center text-foreground/70 mb-8">
              Instead of (or in addition to) a gift, you can help us build our honeymoon.
            </p>
            <div className="grid gap-6">
              {honeymoonItems.map((item) => {
                const raised = totals[item.id] || 0;
                const hasGoal = item.goalAmount > 0;
                const progress = hasGoal ? Math.min(100, (raised / item.goalAmount) * 100) : 0;
                return (
                  <article key={item.id} className="border border-foreground/10 rounded-lg overflow-hidden">
                    {item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.name} className="w-full aspect-video object-cover" />
                    )}
                    <div className="p-6">
                      <h3 className="text-xl font-heading font-semibold mb-2">{item.name}</h3>
                      {item.description && <p className="text-foreground/70 mb-4">{item.description}</p>}
                      {hasGoal && (
                        <div className="mb-4">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">${raised.toFixed(2)}</span>
                            <span className="text-foreground/60">of ${item.goalAmount.toFixed(2)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}
                      <HoneymoonPledgeForm itemId={item.id} itemName={item.name} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {!hasLinks && !hasHoneymoon && (
          <p className="text-center text-foreground/60">Registry information coming soon!</p>
        )}
      </div>
    </div>
  );
}
