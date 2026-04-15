import { notFound } from 'next/navigation';
import { TriviaGame } from '@/components/public/TriviaGame';
import { getFeatures } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function TriviaPage() {
  const features = await getFeatures();
  if (!features.trivia) notFound();
  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-4">
        How Well Do You Know Us?
      </h1>
      <p className="text-center text-foreground/70 mb-12 max-w-2xl mx-auto">
        A quick game for the reception. Answer all the questions, then see how you did.
      </p>
      <div className="max-w-xl mx-auto">
        <TriviaGame />
      </div>
    </div>
  );
}
