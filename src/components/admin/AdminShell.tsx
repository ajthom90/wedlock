'use client';
import { useState, useCallback, useEffect } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminNotificationBell } from '@/components/admin/AdminNotificationBell';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const onClose = useCallback(() => setNavOpen(false), []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [onClose]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-100">
      <div className="md:hidden sticky top-0 z-30 h-14 bg-gray-800 text-white flex items-center gap-3 px-4">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={navOpen}
          aria-controls="admin-sidebar"
          className="p-2 -ml-2 text-xl leading-none"
          onClick={() => setNavOpen(true)}
        >
          ☰
        </button>
        <span className="font-bold">Wedding Admin</span>
        <div className="ml-auto">
          <AdminNotificationBell align="right" />
        </div>
      </div>
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <AdminNav open={navOpen} onClose={onClose} />
      <main className="flex-1 min-w-0 p-4 md:p-8">{children}</main>
    </div>
  );
}
