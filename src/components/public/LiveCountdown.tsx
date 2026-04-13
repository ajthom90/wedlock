'use client';

import { useState, useEffect } from 'react';

export function LiveCountdown({
  weddingDate,
  weddingTime,
}: {
  weddingDate: string;
  weddingTime?: string;
}) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const [year, month, day] = weddingDate.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    if (weddingTime) {
      const [h, m] = weddingTime.split(':').map(Number);
      target.setHours(h, m, 0, 0);
    }

    const update = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [weddingDate, weddingTime]);

  return (
    <div className="flex justify-center gap-6 md:gap-12" role="timer" aria-label="Countdown to wedding">
      {[
        { value: timeLeft.days, label: 'Days' },
        { value: timeLeft.hours, label: 'Hours' },
        { value: timeLeft.minutes, label: 'Minutes' },
        { value: timeLeft.seconds, label: 'Seconds' },
      ].map(({ value, label }) => (
        <div key={label} className="text-center">
          <div className="text-4xl md:text-6xl font-heading font-bold text-primary" aria-label={`${value} ${label}`}>
            {value}
          </div>
          <div className="text-sm uppercase tracking-wider text-foreground/60 mt-2" aria-hidden="true">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
