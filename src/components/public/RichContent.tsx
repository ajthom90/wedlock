import { renderContent } from '@/lib/renderContent';

interface Props {
  html: string | null | undefined;
  className?: string;
}

// This component renders HTML that has already been sanitized by renderContent()
// (which runs DOMPurify against a strict allowlist). The React prop used below
// is the standard React mechanism for injecting an HTML string into the DOM —
// its safety is enforced by renderContent's sanitization, not by React.
export function RichContent({ html, className }: Props) {
  const sanitized = renderContent(html);
  if (!sanitized) return null;
  const innerHtmlProp = { __html: sanitized };
  return (
    <div
      className={className ?? 'rich-content'}
      dangerouslySetInnerHTML={innerHtmlProp}
    />
  );
}
