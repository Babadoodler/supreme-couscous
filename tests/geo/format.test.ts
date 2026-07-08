import { describe, expect, it } from 'vitest';
import { formatCoord, formatDistance, formatLatLon, slugifyFilename } from '../../src/lib/geo/format';

describe('formatCoord', () => {
  it('renders 6 decimal places', () => {
    expect(formatCoord(-37.8136)).toBe('-37.813600');
    expect(formatCoord(144.9631)).toBe('144.963100');
  });
  it('rounds beyond 6 decimals', () => {
    expect(formatCoord(1.23456789)).toBe('1.234568');
  });
  it('never emits negative zero', () => {
    expect(formatCoord(-0.0000001)).toBe('0.000000');
  });
  it('uses a period regardless of locale conventions', () => {
    expect(formatCoord(1.5)).toContain('.');
    expect(formatCoord(1.5)).not.toContain(',');
  });
});

describe('formatLatLon', () => {
  it('joins with comma-space', () => {
    expect(formatLatLon({ lat: -37.8136, lon: 144.9631 })).toBe('-37.813600, 144.963100');
  });
});

describe('formatDistance', () => {
  it('shows metres under 1 km', () => expect(formatDistance(850)).toBe('850 m'));
  it('shows one decimal under 10 km', () => expect(formatDistance(3210)).toBe('3.2 km'));
  it('rounds whole km at 10+', () => expect(formatDistance(12600)).toBe('13 km'));
  it('shows feet for tiny imperial distances', () => expect(formatDistance(50, 'imperial')).toBe('164 ft'));
  it('shows miles', () => expect(formatDistance(1609.344, 'imperial')).toBe('1.0 mi'));
});

describe('slugifyFilename', () => {
  it('slugifies names', () => {
    expect(slugifyFilename('Melbourne CBD Loop')).toBe('melbourne-cbd-loop.gpx');
  });
  it('strips punctuation and diacritics', () => {
    expect(slugifyFilename("Café — René's walk!")).toBe('cafe-rene-s-walk.gpx');
  });
  it('falls back to a dated name for empty/symbol-only names', () => {
    const now = new Date(2026, 6, 8, 9, 5); // local time
    expect(slugifyFilename('★☆★', now)).toBe('route-20260708-0905.gpx');
    expect(slugifyFilename('', now)).toBe('route-20260708-0905.gpx');
  });
  it('caps very long names', () => {
    expect(slugifyFilename('x'.repeat(200)).length).toBeLessThanOrEqual(64);
  });
});
