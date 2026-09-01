'use client';
import { useState, useEffect, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

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

export function AdminNotificationBell({ align = 'left' }: { align?: 'left' | 'right' }) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

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

  return (
    <div ref={panelRef} className={align === 'right' ? 'relative' : undefined}>
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
        <div
          className={cn(
            'absolute top-full mt-2 z-50 bg-white text-gray-900 rounded-md shadow-xl border border-gray-200 overflow-hidden',
            align === 'left' ? 'left-0 right-0' : 'right-0 w-80 max-w-[calc(100vw-1rem)]',
          )}
        >
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
  );
}
