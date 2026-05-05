import { RichContent } from '@/components/public/RichContent';
import type { PageRecord } from '@/lib/page-routing';

export function CustomPageContent({ pageRow }: { pageRow: PageRecord }) {
  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">
        {pageRow.title}
      </h1>
      <div className="max-w-3xl mx-auto">
        {pageRow.bodyHtml ? (
          <RichContent html={pageRow.bodyHtml} className="rich-content text-foreground/80" />
        ) : (
          <p className="text-center text-foreground/60">This page is empty.</p>
        )}
      </div>
    </div>
  );
}
