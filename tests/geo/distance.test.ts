import { describe, expect, it } from 'vitest';
import { haversineMeters, routeDistanceMeters } from '../../src/lib/geo/distance';

const FLINDERS = { lat: -37.81834, lon: 144.96703 };
const FED_SQUARE = { lat: -37.817979, lon: 144.96828 };
const SYDNEY = { lat: -33.8688, lon: 151.2093 };

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters(FLINDERS, FLINDERS)).toBe(0);
  });
  it('measures short hops (~120 m Flinders → Fed Square)', () => {
    const d = haversineMeters(FLINDERS, FED_SQUARE);
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(160);
  });
  it('measures Melbourne → Sydney ≈ 714 km', () => {
    const d = haversineMeters(FLINDERS, SYDNEY);
    expect(d / 1000).toBeGreaterThan(700);
    expect(d / 1000).toBeLessThan(730);
  });
  it('is symmetric', () => {
    expect(haversineMeters(FLINDERS, SYDNEY)).toBeCloseTo(haversineMeters(SYDNEY, FLINDERS), 6);
  });
});

describe('routeDistanceMeters', () => {
  const square = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 0.01 },
    { lat: 0.01, lon: 0.01 },
    { lat: 0.01, lon: 0 }
  ];
  it('returns 0 for fewer than two points', () => {
    expect(routeDistanceMeters([])).toBe(0);
    expect(routeDistanceMeters([FLINDERS])).toBe(0);
  });
  it('sums consecutive legs', () => {
    const open = routeDistanceMeters(square);
    expect(open).toBeCloseTo(3 * haversineMeters(square[0]!, square[1]!), 0);
  });
  it('adds the closing leg when loop=true', () => {
    const open = routeDistanceMeters(square);
    const closed = routeDistanceMeters(square, true);
    expect(closed).toBeCloseTo(open + haversineMeters(square[3]!, square[0]!), 6);
  });
  it('does not close a 2-point route', () => {
    const pts = [square[0]!, square[1]!];
    expect(routeDistanceMeters(pts, true)).toBeCloseTo(routeDistanceMeters(pts), 6);
  });
});
