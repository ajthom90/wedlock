'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export type NavItem = {
  href: string | null;
  label: string;
  children?: NavItem[];
};

export function MobileNav({
  items,
  coupleTitle,
}: {
  items: NavItem[];
  coupleTitle: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-foreground/10 relative">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-2xl font-heading font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {coupleTitle}
          </Link>
          {/* Desktop nav */}
          <nav
            className="hidden md:flex flex-wrap gap-1 md:gap-2 items-center"
            aria-label="Main navigation"
          >
            {items.map((item, i) => (
              <DesktopItem key={`${item.label}-${i}`} item={item} />
            ))}
          </nav>
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-foreground/80 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {open ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
        {/* Mobile menu dropdown */}
        {open && (
          <nav
            className="md:hidden mt-4 pb-2 border-t border-foreground/10 pt-4"
            aria-label="Mobile navigation"
          >
            <div className="flex flex-col gap-1">
              {items.map((item, i) => (
                <MobileItem key={`${item.label}-${i}`} item={item} onNavigate={() => setOpen(false)} />
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}

function DesktopItem({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasChildren = !!item.children?.length;

  // Click-outside closes the dropdown. Hover opens/closes it too, but click
  // is the authoritative control so keyboard and touch work.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  if (!hasChildren) {
    return (
      <Link
        href={item.href || '#'}
        className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {item.href ? (
        <div className="flex items-center">
          <Link
            href={item.href}
            className="pl-3 pr-1 py-2 text-sm font-medium text-foreground/80 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {item.label}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
            className="pl-0.5 pr-3 py-2 text-foreground/80 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            <Chevron open={open} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          {item.label}
          <Chevron open={open} />
        </button>
      )}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 min-w-[180px] bg-background border border-foreground/10 rounded-md shadow-lg py-1"
        >
          {item.children!.map((child, i) => (
            <Link
              key={`${child.label}-${i}`}
              href={child.href || '#'}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-foreground/80 hover:text-primary hover:bg-foreground/5 transition-colors"
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = !!item.children?.length;

  if (!hasChildren) {
    return (
      <Link
        href={item.href || '#'}
        className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-foreground/5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onNavigate}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center">
        {item.href ? (
          <Link
            href={item.href}
            className="flex-1 px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-foreground/5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex-1 text-left px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-foreground/5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {item.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label} submenu`}
          className="px-3 py-2 text-foreground/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          <Chevron open={expanded} />
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col ml-4 border-l border-foreground/10 pl-2 mt-1">
          {item.children!.map((child, i) => (
            <Link
              key={`${child.label}-${i}`}
              href={child.href || '#'}
              className="px-3 py-2 text-sm text-foreground/70 hover:text-primary hover:bg-foreground/5 rounded transition-colors"
              onClick={onNavigate}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.1l3.71-3.87a.75.75 0 111.08 1.04l-4.25 4.43a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}
