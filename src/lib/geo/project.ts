// Fit lat/lon points into a pixel box with uniform scale (no distortion).
// Shared by the SVG minimap and the PNG share-card canvas. Pure module.

import type { LatLon } from '../types';

export interface XY {
  x: number;
  y: number;
}

export function fitPointsToBox(points: LatLon[], width: number, height: number, pad: number): XY[] {
  if (points.length === 0) return [];
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  // Clamp spans only for the scale (degenerate/collinear input); centre with
  // the REAL spans so a single point lands mid-box, not offset.
  const spanLat = Math.max(maxLat - minLat, 1e-9);
  const spanLon = Math.max(maxLon - minLon, 1e-9);
  const scale = Math.min((width - 2 * pad) / spanLon, (height - 2 * pad) / spanLat);
  const ox = (width - (maxLon - minLon) * scale) / 2;
  const oy = (height - (maxLat - minLat) * scale) / 2;
  return points.map((p) => ({
    x: ox + (p.lon - minLon) * scale,
    y: oy + (maxLat - p.lat) * scale
  }));
}
