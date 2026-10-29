import prisma from '@/lib/prisma';
import { ensureSeatsLinked } from '@/lib/seatLinkingDb';
import { ensureTableNumbers } from '@/lib/tableNumbersDb';
import { compareTables, tableHeading } from '@/lib/tableNumbers';

export const dynamic = 'force-dynamic';

export default async function SeatingPage() {
  await ensureSeatsLinked();
  await ensureTableNumbers();
  const rows = await prisma.seatingTable.findMany({
    include: { assignments: { include: { guest: { select: { name: true } } } } },
  });
  // A linked seat shows the guest's current name, so renames show up here.
  const tables = rows.sort(compareTables).map((t) => ({
    ...t,
    heading: tableHeading(t),
    assignments: t.assignments
      .map((a) => ({ id: a.id, name: a.guest?.name ?? a.guestName }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-4">
        Seating Chart
      </h1>
      <p className="text-center text-foreground/60 mb-12">
        Find your table assignment below.
      </p>
      <div className="max-w-5xl mx-auto">
        {tables.length === 0 ? (
          <p className="text-center text-foreground/60 py-8">
            Seating assignments coming soon!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tables.map((table) => (
              <article
                key={table.id}
                className="border border-foreground/10 rounded-lg p-6 hover:border-primary/30 hover:shadow-md transition-all"
              >
                <h2 className="text-xl font-heading font-semibold text-primary mb-1">
                  {table.heading}
                </h2>
                <p className="text-xs text-foreground/40 mb-4">
                  {table.assignments.length} / {table.capacity} seats
                </p>
                {table.assignments.length === 0 ? (
                  <p className="text-sm text-foreground/50 italic">
                    No guests assigned yet.
                  </p>
                ) : (
                  <ul className="space-y-1" aria-label={`Guests at ${table.heading}`}>
                    {table.assignments.map((assignment) => (
                      <li
                        key={assignment.id}
                        className="text-sm text-foreground/80 py-1 border-b border-foreground/5 last:border-0"
                      >
                        {assignment.name}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
