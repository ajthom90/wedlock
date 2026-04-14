'use client';

import { useEffect, useState } from 'react';

interface Props {
  date: string;   // ISO date (YYYY-MM-DD)
  lat: string;
  lng: string;
}

interface Forecast {
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  tempUnit: string;
}

// Mapping from WMO weather codes (https://open-meteo.com/en/docs) to simple
// emoji + label pairs. Close enough for a decorative countdown widget.
function describeCode(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Clear' };
  if (code === 1 || code === 2) return { icon: '🌤️', label: 'Mostly sunny' };
  if (code === 3) return { icon: '☁️', label: 'Cloudy' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Foggy' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { icon: '🌧️', label: 'Rain' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow' };
  if (code >= 80 && code <= 82) return { icon: '🌧️', label: 'Showers' };
  if (code >= 85 && code <= 86) return { icon: '🌨️', label: 'Snow showers' };
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' };
  return { icon: '🌡️', label: 'Forecast' };
}

/**
 * Shows a short weather forecast for the wedding date when it's within
 * 16 days (open-meteo's free range) and the venue has lat/lng configured.
 * Silently renders nothing when out of range or on fetch failure so the
 * page never shows a broken state.
 */
export function WeatherForecast({ date, lat, lng }: Props) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!date || !lat.trim() || !lng.trim()) {
        setLoading(false);
        return;
      }

      const target = new Date(date);
      if (Number.isNaN(target.getTime())) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const daysAway = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      // open-meteo's forecast API reaches ~16 days out. Beyond that we have
      // nothing useful to show.
      if (daysAway > 16 || daysAway < 0) {
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          latitude: lat.trim(),
          longitude: lng.trim(),
          daily: 'weather_code,temperature_2m_max,temperature_2m_min',
          timezone: 'auto',
          temperature_unit: 'fahrenheit',
          start_date: date,
          end_date: date,
        });
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        const d = data?.daily;
        if (!d || !Array.isArray(d.weather_code) || d.weather_code.length === 0) return;
        if (cancelled) return;
        setForecast({
          tempMax: Math.round(d.temperature_2m_max[0]),
          tempMin: Math.round(d.temperature_2m_min[0]),
          weatherCode: d.weather_code[0],
          tempUnit: data.daily_units?.temperature_2m_max || '°F',
        });
      } catch {
        // Swallow — widget disappears on failure.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [date, lat, lng]);

  if (loading || !forecast) return null;

  const { icon, label } = describeCode(forecast.weatherCode);
  return (
    <div className="mt-8 inline-flex items-center gap-4 px-6 py-3 rounded-full bg-white/60 border border-foreground/10">
      <span className="text-3xl" aria-hidden="true">{icon}</span>
      <div className="text-left">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-foreground/70">
          High {forecast.tempMax}{forecast.tempUnit} · Low {forecast.tempMin}{forecast.tempUnit}
        </p>
      </div>
    </div>
  );
}
