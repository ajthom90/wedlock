import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function FaqPage() {
  const faqs = await prisma.faqItem.findMany({ orderBy: { order: 'asc' } });

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">
        Frequently Asked Questions
      </h1>
      <div className="max-w-3xl mx-auto">
        {faqs.length === 0 ? (
          <p className="text-center text-foreground/60 py-8">
            Check back later for frequently asked questions.
          </p>
        ) : (
          <div className="space-y-4">
            {faqs.map((faq) => (
              <details
                key={faq.id}
                className="group border border-foreground/10 rounded-lg overflow-hidden"
              >
                <summary className="flex items-center justify-between cursor-pointer px-6 py-4 text-lg font-heading font-semibold text-foreground hover:bg-foreground/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset">
                  <span>{faq.question}</span>
                  <svg
                    className="w-5 h-5 text-foreground/40 transition-transform group-open:rotate-180 flex-shrink-0 ml-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </summary>
                <div className="px-6 pb-4 text-foreground/80 leading-relaxed">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
