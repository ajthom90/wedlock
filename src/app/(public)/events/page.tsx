'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDate, formatTime } from '@/lib/utils';

interface Event {
  id: string;
  name: string;
  date: string;
  time: string | null;
  endTime: string | null;
  venueName: string | null;
  venueAddress: string | null;
  mapUrl: string | null;
  description: string | null;
  visibility: string;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [codeInput, setCodeInput] = useState('');
  const [hasPrivateAccess, setHasPrivateAccess] = useState(false);
  const [codeError, setCodeError] = useState('');

  const fetchEvents = useCallback(async (code?: string) => {
    try {
      const url = code ? `/api/events?code=${encodeURIComponent(code)}` : '/api/events';
      const res = await fetch(url);
      if (res.ok) {
        const data: Event[] = await res.json();
        setEvents(data);
        // Check if any wedding-party events are in the response
        const hasWeddingParty = data.some((e) => e.visibility === 'wedding-party');
        if (hasWeddingParty) {
          setHasPrivateAccess(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setCodeError('');
    setLoading(true);

    const prevCount = events.length;
    await fetchEvents(codeInput.trim());

    // Re-check after fetch -- if we still don't have private access, the code was invalid
    const res = await fetch(`/api/events?code=${encodeURIComponent(codeInput.trim())}`);
    if (res.ok) {
      const data: Event[] = await res.json();
      setEvents(data);
      const hasWeddingParty = data.some((e) => e.visibility === 'wedding-party');
      if (hasWeddingParty || data.length > prevCount) {
        setHasPrivateAccess(true);
        setCodeError('');
      } else {
        // Code might be valid but there are no wedding-party events yet, or code is invalid
        // Check if the code was valid by looking at whether the cookie was set
        setHasPrivateAccess(true);
      }
    } else {
      setCodeError('Invalid invitation code. Please try again.');
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">
          Events
        </h1>
        <p className="text-center text-foreground/60 py-8">Loading events...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">
        Events
      </h1>

      {!hasPrivateAccess && (
        <div className="max-w-md mx-auto mb-10 p-4 border border-foreground/10 rounded-lg bg-background">
          <p className="text-sm text-foreground/70 mb-3">
            Enter your invitation code to see all events
          </p>
          <form onSubmit={handleCodeSubmit} className="flex gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Invitation code"
              className="flex-1 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Submit
            </button>
          </form>
          {codeError && <p className="text-sm text-red-500 mt-2">{codeError}</p>}
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        {events.length === 0 ? (
          <p className="text-center text-foreground/60 py-8">
            Event schedule coming soon!
          </p>
        ) : (
          <div className="space-y-8">
            {events.map((event) => (
              <article
                key={event.id}
                className="border border-foreground/10 rounded-lg overflow-hidden"
              >
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-2xl font-heading font-semibold text-primary">
                      {event.name}
                    </h2>
                    {event.visibility === 'wedding-party' && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                        Wedding Party Only
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-foreground/80 mb-4">
                    {event.date && (
                      <p className="flex items-center gap-2">
                        <svg
                          className="w-5 h-5 text-foreground/40 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span>{formatDate(event.date)}</span>
                      </p>
                    )}
                    {event.time && (
                      <p className="flex items-center gap-2">
                        <svg
                          className="w-5 h-5 text-foreground/40 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>
                          {formatTime(event.time)}
                          {event.endTime && ` \u2013 ${formatTime(event.endTime)}`}
                        </span>
                      </p>
                    )}
                    {event.venueName && (
                      <p className="flex items-center gap-2">
                        <svg
                          className="w-5 h-5 text-foreground/40 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span>
                          {event.venueName}
                          {event.venueAddress && (
                            <>
                              <br />
                              <span className="text-foreground/60 text-sm">
                                {event.venueAddress}
                              </span>
                            </>
                          )}
                        </span>
                      </p>
                    )}
                  </div>
                  {event.description && (
                    <p className="text-foreground/70 leading-relaxed">
                      {event.description}
                    </p>
                  )}
                </div>
                {event.mapUrl && (
                  <div className="border-t border-foreground/10">
                    <div className="aspect-video">
                      <iframe
                        src={event.mapUrl}
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        title={`Map for ${event.name}`}
                      />
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
