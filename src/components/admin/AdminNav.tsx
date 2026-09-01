'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AdminNotificationBell } from '@/components/admin/AdminNotificationBell';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  feature?: string;  // feature flag that gates this item; undefined = always shown
  // OR-list of feature flags; if ANY are on, item is visible. Mutually
  // exclusive with `feature`.
  anyFeature?: string[];
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
      { href: '/admin/rsvp-corrections', label: 'RSVP Corrections', icon: '✏️', feature: 'rsvpCorrections' },
      { href: '/admin/rsvp-config', label: 'RSVP Form', icon: '📝' },
      { href: '/admin/seating', label: 'Seating', icon: '🪑' },
      { href: '/admin/guestbook', label: 'Guest Book', icon: '📖', feature: 'guestBook' },
    ],
  },
  {
    label: 'Site Content',
    icon: '📝',
    items: [
      { href: '/admin/pages', label: 'Pages', icon: '📄' },
      { href: '/admin/content', label: 'Content', icon: '✍️' },
      { href: '/admin/banner', label: 'Home Banner', icon: '🏞️' },
      { href: '/admin/wedding-party', label: 'Wedding Party', icon: '💑' },
      { href: '/admin/details', label: 'Details', icon: '📅' },
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
      { href: '/admin/broadcasts', label: 'Broadcasts', icon: '📣', feature: 'dayOfBroadcasts' },
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
      { href: '/admin/email-settings', label: 'Email Settings', icon: '✉️', anyFeature: ['rsvpConfirmationEmails', 'dayOfBroadcasts'] },
      { href: '/admin/features', label: 'Features', icon: '🔧' },
      { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

// Dashboard sits outside the groups — always one click away.
const TOP_LEVEL: NavItem = { href: '/admin', label: 'Dashboard', icon: '📊' };

const COLLAPSE_STORAGE_KEY = 'admin-nav-collapsed-groups';

function isItemVisible(item: NavItem, features: Record<string, unknown>): boolean {
  if (item.anyFeature) {
    return item.anyFeature.some((f) => {
      const val = features[f];
      if (val === undefined || val === null) return true;  // loading state — fail-open
      if (typeof val === 'string') return val !== 'off';   // guestBook
      return !!val;
    });
  }
  if (!item.feature) return true;
  const val = features[item.feature];
  if (val === undefined || val === null) return true;  // loading state — fail-open
  if (typeof val === 'string') return val !== 'off';   // guestBook
  return !!val;
}

export function AdminNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [features, setFeatures] = useState<Record<string, unknown>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    // Version is read from package.json server-side. This is lazy and
    // tolerates failure — the footer just shows blank if the endpoint
    // isn't reachable (e.g. old image without the route).
    fetch('/api/release-notes')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.currentVersion) setCurrentVersion(d.currentVersion); })
      .catch(() => { /* silent */ });
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
    fetchFeatures();
  }, [fetchFeatures]);

  // Close the mobile drawer on navigation. Kept separate from the collapse-
  // hydration effect so a route change cannot skip or double-run localStorage.
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
    onClose();
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  // Groups only render after mount to avoid SSR/client mismatch on collapse
  // state — the initial empty set would momentarily show every group open
  // before localStorage hydrates.
  return (
    <nav
      id="admin-sidebar"
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 bg-gray-800 text-white flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 md:min-h-screen md:shrink-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="p-4 border-b border-gray-700">
        <div className="flex justify-between items-center relative">
          <h1 className="text-xl font-bold">Wedding Admin</h1>
          <div className="flex items-center gap-1">
            <AdminNotificationBell />
            <button
              type="button"
              className="md:hidden p-2 -mr-2 text-lg leading-none text-gray-300 hover:text-white"
              aria-label="Close menu"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 py-2 overflow-y-auto">
        {/* Dashboard — always at the top, not in a group */}
        <NavLink item={TOP_LEVEL} pathname={pathname} onClick={onClose} />

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
                  {visibleItems.map((item) => <NavLink key={item.href} item={item} pathname={pathname} indented onClick={onClose} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-700 p-4">
        <Link href="/" onClick={onClose} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors" target="_blank">
          <span>🌐</span><span>View Site</span>
        </Link>
        <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors w-full text-left">
          <span>🚪</span><span>Logout</span>
        </button>
        {currentVersion && (
          <Link
            href="/admin/changelog"
            className="block mt-3 px-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            title="What's new"
          >
            wedlock v{currentVersion}
          </Link>
        )}
      </div>
    </nav>
  );
}

function NavLink({ item, pathname, indented, onClick }: { item: NavItem; pathname: string; indented?: boolean; onClick?: () => void }) {
  const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
  return (
    <Link
      href={item.href}
      onClick={onClick}
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
