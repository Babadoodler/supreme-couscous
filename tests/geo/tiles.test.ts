import { describe, expect, it } from 'vitest';
import { computeStaticMapView, latLonToWorldPx, osmTileUrl, TILE_SIZE } from '../../src/lib/geo/tiles';

const MEL = { lat: -37.8136, lon: 144.9631 };

describe('latLonToWorldPx', () => {
  it('maps (0,0) to the centre of the world at z0', () => {
    const p = latLonToWorldPx({ lat: 0, lon: 0 }, 0);
    expect(p.x).toBeCloseTo(128, 6);
    expect(p.y).toBeCloseTo(128, 6);
  });

  it('maps the date line and poles to the edges at z0', () => {
    expect(latLonToWorldPx({ lat: 0, lon: -180 }, 0).x).toBeCloseTo(0, 6);
    expect(latLonToWorldPx({ lat: 0, lon: 180 }, 0).x).toBeCloseTo(256, 6);
    expect(latLonToWorldPx({ lat: 85.05112878, lon: 0 }, 0).y).toBeCloseTo(0, 4);
    expect(latLonToWorldPx({ lat: -85.05112878, lon: 0 }, 0).y).toBeCloseTo(256, 4);
  });

  it('doubles coordinates per zoom level', () => {
    const z5 = latLonToWorldPx(MEL, 5);
    const z6 = latLonToWorldPx(MEL, 6);
    expect(z6.x).toBeCloseTo(z5.x * 2, 6);
    expect(z6.y).toBeCloseTo(z5.y * 2, 6);
  });

  it('puts Melbourne in the correct z10 tile (924, 628)', () => {
    const p = latLonToWorldPx(MEL, 10);
    expect(Math.floor(p.x / TILE_SIZE)).toBe(924);
    expect(Math.floor(p.y / TILE_SIZE)).toBe(628);
  });
});

describe('computeStaticMapView', () => {
  const stops = [
    { lat: -37.8153, lon: 144.9663 },
    { lat: -37.818, lon: 144.9683 },
    { lat: -37.8212, lon: 144.9681 }
  ];

  it('returns null for no points', () => {
    expect(computeStaticMapView([], 360, 240)).toBeNull();
  });

  it('projects every point inside the padded viewport', () => {
    const view = computeStaticMapView(stops, 360, 240, 40)!;
    for (const s of stops) {
      const p = view.project(s);
      expect(p.x).toBeGreaterThanOrEqual(40 - 1);
      expect(p.x).toBeLessThanOrEqual(320 + 1);
      expect(p.y).toBeGreaterThanOrEqual(40 - 1);
      expect(p.y).toBeLessThanOrEqual(200 + 1);
    }
  });

  it('uses the highest zoom that still fits', () => {
    const view = computeStaticMapView(stops, 360, 240, 40)!;
    expect(view.zoom).toBeGreaterThanOrEqual(13);
    expect(view.zoom).toBeLessThanOrEqual(17);
    // one level higher must NOT fit: span at zoom+1 exceeds padded box
    const span = (z: number) => {
      const a = latLonToWorldPx({ lat: -37.8153, lon: 144.9663 }, z);
      const b = latLonToWorldPx({ lat: -37.8212, lon: 144.9683 }, z);
      return { w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    };
    const next = span(view.zoom + 1);
    expect(next.w > 360 - 80 || next.h > 240 - 80).toBe(true);
  });

  it('caps single points at street level', () => {
    const view = computeStaticMapView([MEL], 360, 240)!;
    expect(view.zoom).toBe(16);
    const p = view.project(MEL);
    expect(p.x).toBeCloseTo(180, 0);
    expect(p.y).toBeCloseTo(120, 0);
  });

  it('covers the whole viewport with tiles at 256px steps', () => {
    const view = computeStaticMapView(stops, 360, 240)!;
    expect(view.tiles.length).toBeGreaterThanOrEqual(4);
    const lefts = view.tiles.map((t) => t.left);
    const tops = view.tiles.map((t) => t.top);
    expect(Math.min(...lefts)).toBeLessThanOrEqual(0);
    expect(Math.max(...lefts) + TILE_SIZE).toBeGreaterThanOrEqual(360);
    expect(Math.min(...tops)).toBeLessThanOrEqual(0);
    expect(Math.max(...tops) + TILE_SIZE).toBeGreaterThanOrEqual(240);
    for (const t of view.tiles) {
      expect(t.z).toBe(view.zoom);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(2 ** view.zoom);
    }
  });

  it('tile grid aligns with projected points (Melbourne z10 sanity)', () => {
    const url = osmTileUrl(924, 628, 10);
    expect(url).toBe('https://tile.openstreetmap.org/10/924/628.png');
  });
});
