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
 * Simplify to exactly the target point count using Douglas–Peucker
 * importance ranking: each point gets the tolerance at which DP would
 * include it, then the top-N survive. Unlike binary-searching a tolerance,
 * this hits the requested count even when DP counts jump discontinuously
 * (e.g. a near-straight noisy track). Drives the import slider UI.
 */
export function simplifyToCount<T extends LatLon>(points: T[], targetCount: number): T[] {
  if (targetCount >= points.length) return [...points];
  if (targetCount < 2) targetCount = 2;
  const n = points.length;
  const importance = new Array<number>(n).fill(0);
  importance[0] = importance[n - 1] = Infinity;

  // Iterative DP recursion assigning each interior point its inclusion
  // tolerance, clamped so children never outrank their parent split.
  const stack: Array<[number, number, number]> = [[0, n - 1, Infinity]];
  while (stack.length > 0) {
    const [start, end, parentImp] = stack.pop()!;
    if (end - start < 2) continue;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistanceMeters(points[i]!, points[start]!, points[end]!);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    const imp = Math.min(maxDist, parentImp);
    importance[maxIdx] = imp;
    stack.push([start, maxIdx, imp], [maxIdx, end, imp]);
  }

  const keepIdx = importance
    .map((imp, i) => [imp, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, targetCount)
    .map(([, i]) => i)
    .sort((a, b) => a - b);
  return keepIdx.map((i) => points[i]!);
}
