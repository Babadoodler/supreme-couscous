// Display/serialisation formatting for coordinates and distances. Pure module.

import type { LatLon } from '../types';

/**
 * GPX/display coordinate formatting: 6 decimal places (~0.1 m), period
 * decimal separator regardless of locale (DESIGN.md §4.3).
 */
export function formatCoord(value: number): string {
  const s = value.toFixed(6);
  return s === '-0.000000' ? '0.000000' : s;
}

export function formatLatLon(p: LatLon): string {
  return `${formatCoord(p.lat)}, ${formatCoord(p.lon)}`;
}

export type DistanceUnit = 'metric' | 'imperial';

/** Human distance: "850 m" / "3.2 km" or "0.5 mi" style. */
export function formatDistance(meters: number, unit: DistanceUnit = 'metric'): string {
  if (unit === 'imperial') {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round(meters / 0.3048)} ft`;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Slugify a route name for use as a .gpx filename (DESIGN.md §4.3). */
export function slugifyFilename(name: string, now = new Date()): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics left by NFKD
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (slug) return `${slug}.gpx`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `route-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.gpx`;
}
