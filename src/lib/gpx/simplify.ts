// Douglas–Peucker polyline simplification for imported tracks
// (DESIGN.md §10: offer simplification when a track has >200 points).
// Pure module.

import type { LatLon } from '../types';

/** Perpendicular distance (metres, equirectangular approx — fine at track scale). */
function perpendicularDistanceMeters(p: LatLon, a: LatLon, b: LatLon): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const cosLat = Math.cos(toRad((a.lat + b.lat) / 2));
  const ax = toRad(a.lon) * cosLat * R;
  const ay = toRad(a.lat) * R;
  const bx = toRad(b.lon) * cosLat * R;
  const by = toRad(b.lat) * R;
  const px = toRad(p.lon) * cosLat * R;
  const py = toRad(p.lat) * R;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Classic Douglas–Peucker with a distance tolerance in metres. */
export function simplifyTolerance<T extends LatLon>(points: T[], toleranceMeters: number): T[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistanceMeters(points[i]!, points[start]!, points[end]!);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > toleranceMeters && maxIdx > 0) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Simplify down to (at most) a target point count by binary-searching the
 * tolerance. Drives the import slider UI ("~50 points" default).
 */
export function simplifyToCount<T extends LatLon>(points: T[], targetCount: number): T[] {
  if (targetCount >= points.length) return [...points];
  if (targetCount < 2) targetCount = 2;
  let lo = 0.01; // metres
  let hi = 100_000;
  let best = simplifyTolerance(points, lo);
  for (let iter = 0; iter < 40 && best.length !== targetCount; iter++) {
    const mid = (lo + hi) / 2;
    const attempt = simplifyTolerance(points, mid);
    if (attempt.length > targetCount) {
      lo = mid;
    } else {
      hi = mid;
      best = attempt;
    }
  }
  return best;
}
