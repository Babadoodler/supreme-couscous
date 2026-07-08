// Great-circle distance (haversine). Pure module.

import type { LatLon } from '../types';

const EARTH_RADIUS_M = 6371008.8;

export function haversineMeters(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** Total straight-line length of a point sequence; closes the loop when asked. */
export function routeDistanceMeters(points: LatLon[], loop = false): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineMeters(points[i - 1]!, points[i]!);
  if (loop && points.length > 2) total += haversineMeters(points[points.length - 1]!, points[0]!);
  return total;
}
