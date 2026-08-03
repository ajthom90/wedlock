'use client';
import { useState, useEffect, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  feature?: string;  // feature flag that gates this item; undefined = always shown
  // OR-list of feature flags; if ANY are on, item is visible. Mutually
  // exclusive with `feature`.
  anyFeature?: string[];
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// Where clicking a notification should land in admin, by type written at create time.
function notificationHref(type: string): string {
  switch (type) {
    case 'rsvp':
      return '/admin/rsvps';
    case 'guestbook':
      return '/admin/guestbook';
    case 'honeymoon':
      return '/admin/honeymoon';
    default:
      return '/admin';
  }
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

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
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

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unread=true');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(Array.isArray(data) ? data.length : 0);
      }
    } catch { /* silent */ }
  }, []);

  const loadPanel = useCallback(async () => {
    setPanelLoading(true);
    try {
      // Recent first; include read so the couple can skim history after
      // clearing the badge without losing context on what came in.
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setNotifications(data);
          setUnreadCount(data.filter((n: Notification) => !n.read).length);
        }
      }
    } catch { /* silent */ } finally {
      setPanelLoading(false);
    }
  }, []);

  const openPanel = async () => {
    const next = !panelOpen;
    setPanelOpen(next);
    if (next) await loadPanel();
  };

  const markAllRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch { /* silent */ }
  };

  const markRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'PUT' });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch { /* silent */ }
  };

  const dismissNotification = async (id: string, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wasUnread = notifications.some((n) => n.id === id && !n.read);
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) await markRead(n.id);
    setPanelOpen(false);
    router.push(notificationHref(n.type));
  };

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
    fetchUnreadCount();
    fetchFeatures();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount, fetchFeatures]);

  // Close the panel when clicking outside it.
  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [panelOpen]);

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
        <div className="flex justify-between items-center relative" ref={panelRef}>
          <h1 className="text-xl font-bold">Wedding Admin</h1>
          <button
            type="button"
            onClick={openPanel}
            className="relative p-1 text-gray-300 hover:text-white transition-colors"
            title="Notifications"
            aria-expanded={panelOpen}
            aria-haspopup="true"
          >
            <span className="text-lg">🔔</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {panelOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white text-gray-900 rounded-md shadow-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-semibold">Notifications</p>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs text-primary hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {panelLoading && notifications.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-gray-500 text-center">Loading…</p>
                ) : notifications.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-gray-500 text-center">No notifications yet</p>
                ) : (
                  <ul>
                    {notifications.map((n) => (
                      <li key={n.id} className={cn('border-b border-gray-100 last:border-0', !n.read && 'bg-blue-50/60')}>
                        <div className="flex items-start gap-1">
                          <button
                            type="button"
                            onClick={() => handleNotificationClick(n)}
                            className="flex-1 text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                          >
                            <p className={cn('text-sm', !n.read ? 'font-semibold' : 'font-medium text-gray-700')}>
                              {n.title}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[11px] text-gray-400 mt-1">
                              {new Date(n.createdAt).toLocaleString()}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => dismissNotification(n.id, e)}
                            className="shrink-0 p-2 text-gray-400 hover:text-gray-700 text-xs"
                            title="Dismiss"
                            aria-label="Dismiss notification"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
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
