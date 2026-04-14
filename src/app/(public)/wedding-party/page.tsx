import prisma from '@/lib/prisma';
import { Framed } from '@/components/public/Framed';

export const dynamic = 'force-dynamic';

type Member = {
  id: string;
  name: string;
  role: string;
  side: string;
  description: string | null;
  imageUrl: string | null;
  focalX: number;
  focalY: number;
  zoom: number;
};

export default async function WeddingPartyPage() {
  const members = await prisma.weddingPartyMember.findMany({ orderBy: [{ side: 'asc' }, { order: 'asc' }] });
  const brideParty = members.filter((m) => m.side === 'bride');
  const groomParty = members.filter((m) => m.side === 'groom');

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">Wedding Party</h1>
      {members.length === 0 ? (
        <p className="text-center text-foreground/60">Wedding party details coming soon!</p>
      ) : (
        <div className="max-w-5xl mx-auto space-y-16">
          {brideParty.length > 0 && (
            <section>
              <h2 className="text-3xl font-heading font-semibold text-center mb-8">Bride&apos;s Party</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {brideParty.map((m) => <MemberCard key={m.id} member={m} />)}
              </div>
            </section>
          )}
          {groomParty.length > 0 && (
            <section>
              <h2 className="text-3xl font-heading font-semibold text-center mb-8">Groom&apos;s Party</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {groomParty.map((m) => <MemberCard key={m.id} member={m} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function MemberCard({ member }: { member: Member }) {
  return (
    <div className="text-center">
      {member.imageUrl ? (
        <div className="w-40 h-40 rounded-full overflow-hidden mx-auto mb-4 bg-secondary/20">
          <Framed
            src={member.imageUrl}
            alt={member.name}
            focalX={member.focalX}
            focalY={member.focalY}
            zoom={member.zoom}
          />
        </div>
      ) : (
        <div className="w-40 h-40 rounded-full mx-auto mb-4 bg-secondary/30 flex items-center justify-center text-4xl">👤</div>
      )}
      <h3 className="text-xl font-heading font-semibold">{member.name}</h3>
      <p className="text-primary font-medium">{member.role}</p>
      {member.description && <p className="text-foreground/70 text-sm mt-2">{member.description}</p>}
    </div>
  );
}
