'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  feature?: string;  // feature flag that gates this item; undefined = always shown
}

interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

// Grouped sidebar — 25+ items became unscannable. Groups mirror the mental
// model: who/what is this for? Guests? Public content? Day-of stuff? Private
// tracking? Styling? System?
const navGroups: NavGroup[] = [
  {
    label: 'Guests',
    icon: '👥',
    items: [
      { href: '/admin/invitations', label: 'Invitations', icon: '💌' },
      { href: '/admin/rsvps', label: 'RSVPs', icon: '✓' },
      { href: '/admin/rsvp-config', label: 'RSVP Form', icon: '📝' },
      { href: '/admin/seating', label: 'Seating', icon: '🪑' },
      { href: '/admin/guestbook', label: 'Guest Book', icon: '📖', feature: 'guestBook' },
    ],
  },
  {
    label: 'Site Content',
    icon: '📝',
    items: [
      { href: '/admin/content', label: 'Pages', icon: '📄' },
      { href: '/admin/banner', label: 'Home Banner', icon: '🏞️' },
      { href: '/admin/wedding-party', label: 'Wedding Party', icon: '💑' },
      { href: '/admin/events', label: 'Events', icon: '📅' },
      { href: '/admin/story-timeline', label: 'Story Timeline', icon: '📜', feature: 'storyTimeline' },
      { href: '/admin/faq', label: 'FAQ', icon: '❓' },
    ],
  },
  {
    label: 'Media',
    icon: '📷',
    items: [
      { href: '/admin/media', label: 'Photos', icon: '🖼️' },
      { href: '/admin/fonts', label: 'Fonts', icon: '🔤' },
    ],
  },
  {
    label: 'Day Of',
    icon: '🎉',
    items: [
      { href: '/admin/photo-wall', label: 'Photo Wall', icon: '📸', feature: 'photoWall' },
      { href: '/admin/shuttles', label: 'Shuttles', icon: '🚐', feature: 'transportation' },
      { href: '/admin/trivia', label: 'Trivia', icon: '❔', feature: 'trivia' },
    ],
  },
  {
    label: 'Money',
    icon: '💰',
    items: [
      { href: '/admin/gifts', label: 'Gifts & Registry', icon: '🎁' },
      { href: '/admin/honeymoon', label: 'Honeymoon Fund', icon: '🏝️', feature: 'honeymoonFund' },
      { href: '/admin/budget', label: 'Budget', icon: '💵', feature: 'budgetTracker' },
      { href: '/admin/vendors', label: 'Vendors', icon: '📇', feature: 'vendorContacts' },
    ],
  },
  {
    label: 'Appearance',
    icon: '🎨',
    items: [
      { href: '/admin/theme', label: 'Theme', icon: '🖌️' },
      { href: '/admin/navigation', label: 'Navigation', icon: '🧭' },
    ],
  },
  {
    label: 'System',
    icon: '⚙️',
    items: [
      { href: '/admin/features', label: 'Features', icon: '🔧' },
      { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

// Dashboard sits outside the groups — always one click away.
const TOP_LEVEL: NavItem = { href: '/admin', label: 'Dashboard', icon: '📊' };

const COLLAPSE_STORAGE_KEY = 'admin-nav-collapsed-groups';

function isItemVisible(item: NavItem, features: Record<string, unknown>): boolean {
  if (!item.feature) return true;
  const val = features[item.feature];
  if (val === undefined || val === null) return true;  // loading state — fail-open
  if (typeof val === 'string') return val !== 'off';   // guestBook
  return !!val;
}

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [features, setFeatures] = useState<Record<string, unknown>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unread=true');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(Array.isArray(data) ? data.length : 0);
      }
    } catch { /* silent */ }
  }, []);

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await fetch('/api/features');
      if (res.ok) setFeatures(await res.json());
    } catch { /* silent — fail-open */ }
  }, []);

  // Hydrate collapse state from localStorage once on mount. First-time visitors
  // (no localStorage) get every group collapsed so the sidebar stays scannable;
  // the group containing the current page auto-expands so they always see
  // where they are. Once the user toggles anything, localStorage takes over.
  useEffect(() => {
    const allCollapsed = () => new Set(navGroups.map((g) => g.label));
    try {
      const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
      const stored: string[] = raw ? JSON.parse(raw) : navGroups.map((g) => g.label);
      const next = new Set(stored);

      const activeGroup = navGroups.find((g) =>
        g.items.some((item) => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))),
      );
      if (activeGroup) next.delete(activeGroup.label);

      setCollapsed(next);
    } catch {
      setCollapsed(allCollapsed());
    }
    setHydrated(true);
  }, [pathname]);

  useEffect(() => {
    fetchNotifications();
    fetchFeatures();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications, fetchFeatures]);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try { localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(Array.from(next))); } catch { /* storage disabled */ }
      return next;
    });
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  // Groups only render after mount to avoid SSR/client mismatch on collapse
  // state — the initial empty set would momentarily show every group open
  // before localStorage hydrates.
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

      <div className="flex-1 py-2 overflow-y-auto">
        {/* Dashboard — always at the top, not in a group */}
        <NavLink item={TOP_LEVEL} pathname={pathname} />

        {hydrated && navGroups.map((group) => {
          const visibleItems = group.items.filter((i) => isItemVisible(i, features));
          if (visibleItems.length === 0) return null;
          const isCollapsed = collapsed.has(group.label);
          const hasActive = visibleItems.some((i) => pathname.startsWith(i.href));
          return (
            <div key={group.label} className="mt-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  'w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors',
                  hasActive ? 'text-white' : 'text-gray-400',
                  'hover:text-white',
                )}
              >
                <span className="text-base">{group.icon}</span>
                <span className="flex-1 text-left">{group.label}</span>
                <span className={cn('text-sm transition-transform', isCollapsed ? '' : 'rotate-90')}>▸</span>
              </button>
              {!isCollapsed && (
                <div className="pb-1">
                  {visibleItems.map((item) => <NavLink key={item.href} item={item} pathname={pathname} indented />)}
                </div>
              )}
            </div>
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

function NavLink({ item, pathname, indented }: { item: NavItem; pathname: string; indented?: boolean }) {
  const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 py-2 text-sm transition-colors',
        indented ? 'pl-8 pr-4' : 'px-4',
        isActive ? 'bg-gray-700 text-white border-l-2 border-primary' : 'text-gray-300 hover:bg-gray-700/60 hover:text-white',
      )}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}
