'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/invitations', label: 'Invitations', icon: '💌' },
  { href: '/admin/rsvps', label: 'RSVPs', icon: '✓' },
  { href: '/admin/rsvp-config', label: 'RSVP Form', icon: '📝' },
  { href: '/admin/guestbook', label: 'Guest Book', icon: '📖' },
  { href: '/admin/wedding-party', label: 'Wedding Party', icon: '👥' },
  { href: '/admin/media', label: 'Media', icon: '📷' },
  { href: '/admin/banner', label: 'Home Banner', icon: '🏞️' },
  { href: '/admin/content', label: 'Content', icon: '📄' },
  { href: '/admin/theme', label: 'Theme', icon: '🎨' },
  { href: '/admin/fonts', label: 'Fonts', icon: '🔤' },
  { href: '/admin/events', label: 'Events', icon: '📅' },
  { href: '/admin/faq', label: 'FAQ', icon: '❓' },
  { href: '/admin/seating', label: 'Seating', icon: '🪑' },
  { href: '/admin/gifts', label: 'Gifts & Registry', icon: '🎁' },
  { href: '/admin/vendors', label: 'Vendors', icon: '📇' },
  { href: '/admin/budget', label: 'Budget', icon: '💵' },
  { href: '/admin/story-timeline', label: 'Story Timeline', icon: '📜' },
  { href: '/admin/shuttles', label: 'Shuttles', icon: '🚐' },
  { href: '/admin/honeymoon', label: 'Honeymoon Fund', icon: '🏝️' },
  { href: '/admin/navigation', label: 'Navigation', icon: '🧭' },
  { href: '/admin/features', label: 'Features', icon: '🔧' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unread=true');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {
      // silently ignore notification fetch errors
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <nav className="bg-gray-800 text-white w-64 min-h-screen flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Wedding Admin</h1>
          <button
            onClick={() => router.push('/admin')}
            className="relative p-1 text-gray-300 hover:text-white transition-colors"
            title="Notifications"
          >
            <span className="text-lg">🔔</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
      <div className="flex-1 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className={cn('flex items-center gap-3 px-4 py-3 text-sm transition-colors', isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white')}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="border-t border-gray-700 p-4">
        <Link href="/" className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors" target="_blank">
          <span>🌐</span><span>View Site</span>
        </Link>
        <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors w-full text-left">
          <span>🚪</span><span>Logout</span>
        </button>
      </div>
    </nav>
  );
}
