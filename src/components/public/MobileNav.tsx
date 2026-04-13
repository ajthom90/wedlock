'use client';

import { useState } from 'react';
import Link from 'next/link';

export function MobileNav({
  items,
  coupleTitle,
}: {
  items: { href: string; label: string }[];
  coupleTitle: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-foreground/10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-2xl font-heading font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            {coupleTitle}
          </Link>
          {/* Desktop nav */}
          <nav
            className="hidden md:flex flex-wrap gap-1 md:gap-2"
            aria-label="Main navigation"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                {item.label}
              </Link>
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
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 text-sm font-medium text-foreground/80 hover:text-primary hover:bg-foreground/5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
