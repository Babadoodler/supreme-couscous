// Web-mercator static-map math (DESIGN.md §7.8): choose a zoom that fits a
// route's bounding box into a pixel viewport, list the raster tiles covering
// it, and project points into viewport pixels. Pure module — the overview
// page and the PNG share card share it.

import type { LatLon } from '../types';
import type { XY } from './project';

export const TILE_SIZE = 256;
export const OSM_TILE_ATTRIBUTION = '© OpenStreetMap';

/** Raster tile URL — single constant, swappable (DESIGN.md §12.1). */
export function osmTileUrl(x: number, y: number, z: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

const MAX_LAT = 85.05112878; // web-mercator singularity clamp

/** World pixel coordinates at a zoom (origin: top-left of the world). */
export function latLonToWorldPx(p: LatLon, zoom: number): XY {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat));
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((p.lon + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale
  };
}

export interface StaticMapTile {
  x: number; // tile column (wrapped)
  y: number; // tile row
  z: number;
  left: number; // px position inside the viewport
  top: number;
}

export interface StaticMapView {
  zoom: number;
  tiles: StaticMapTile[];
  project: (p: LatLon) => XY;
}

/**
 * Fit points into a width×height viewport: pick the highest integer zoom
 * (≤ maxZoom) whose bounding box fits inside the padded viewport, centre it,
 * and enumerate the covering tiles.
 */
export function computeStaticMapView(
  points: LatLon[],
  width: number,
  height: number,
  pad = 40,
  maxZoom = 17
): StaticMapView | null {
  if (points.length === 0 || width <= 0 || height <= 0) return null;

  let minLat = Infinity,
    maxLatV = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLatV = Math.max(maxLatV, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }

  const fitsAt = (z: number) => {
    const a = latLonToWorldPx({ lat: maxLatV, lon: minLon }, z);
    const b = latLonToWorldPx({ lat: minLat, lon: maxLon }, z);
    return b.x - a.x <= width - 2 * pad && b.y - a.y <= height - 2 * pad;
  };
  let zoom = 1;
  while (zoom < maxZoom && fitsAt(zoom + 1)) zoom++;
  // Single points would "fit" at any zoom; cap them at a street-level view.
  if (points.length === 1) zoom = Math.min(16, maxZoom);

  const a = latLonToWorldPx({ lat: maxLatV, lon: minLon }, zoom);
  const b = latLonToWorldPx({ lat: minLat, lon: maxLon }, zoom);
  const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const topLeft = { x: centre.x - width / 2, y: centre.y - height / 2 };

  const n = 2 ** zoom;
  const tiles: StaticMapTile[] = [];
  const txMin = Math.floor(topLeft.x / TILE_SIZE);
  const txMax = Math.floor((topLeft.x + width) / TILE_SIZE);
  const tyMin = Math.max(0, Math.floor(topLeft.y / TILE_SIZE));
  const tyMax = Math.min(n - 1, Math.floor((topLeft.y + height) / TILE_SIZE));
  for (let ty = tyMin; ty <= tyMax; ty++) {
    for (let tx = txMin; tx <= txMax; tx++) {
      tiles.push({
        x: ((tx % n) + n) % n, // wrap across the antimeridian
        y: ty,
        z: zoom,
        left: tx * TILE_SIZE - topLeft.x,
        top: ty * TILE_SIZE - topLeft.y
      });
    }
  }

  return {
    zoom,
    tiles,
    project: (p: LatLon) => {
      const w = latLonToWorldPx(p, zoom);
      return { x: w.x - topLeft.x, y: w.y - topLeft.y };
    }
  };
}
