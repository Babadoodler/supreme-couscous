import { describe, expect, it } from 'vitest';
import { simplifyTolerance, simplifyToCount } from '../../src/lib/gpx/simplify';

/** A noisy ~1 km line with a genuine corner in the middle. */
function noisyTrack(n: number) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // L-shape: east then north, with ±~1 m jitter
    const base =
      t < 0.5
        ? { lat: -37.82, lon: 144.96 + t * 0.01 }
        : { lat: -37.82 + (t - 0.5) * 0.01, lon: 144.965 };
    const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    pts.push({ lat: base.lat + jitter * 0.00001, lon: base.lon - jitter * 0.00001 });
  }
  return pts;
}

describe('simplifyTolerance', () => {
  it('keeps endpoints', () => {
    const pts = noisyTrack(100);
    const out = simplifyTolerance(pts, 10);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('collapses a straight noisy line but keeps the corner', () => {
    const pts = noisyTrack(500);
    const out = simplifyTolerance(pts, 15);
    expect(out.length).toBeLessThan(10);
    // The corner (~-37.82, 144.965) must survive.
    const nearCorner = out.some(
      (p) => Math.abs(p.lat - -37.82) < 0.0005 && Math.abs(p.lon - 144.965) < 0.0005
    );
    expect(nearCorner).toBe(true);
  });

  it('preserves order and returns copies for ≤2 points', () => {
    const two = [
      { lat: 1, lon: 1 },
      { lat: 2, lon: 2 }
    ];
    const out = simplifyTolerance(two, 1000);
    expect(out).toEqual(two);
    expect(out).not.toBe(two);
  });

  it('keeps everything at zero tolerance', () => {
    const pts = noisyTrack(50);
    expect(simplifyTolerance(pts, 0)).toHaveLength(50);
  });
});

describe('simplifyToCount', () => {
  it('reduces to (approximately, ≤) the target count', () => {
    const pts = noisyTrack(2000);
    const out = simplifyToCount(pts, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    // DP counts step discontinuously with tolerance; only the ceiling is guaranteed.
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it('returns the input untouched when already small enough', () => {
    const pts = noisyTrack(30);
    expect(simplifyToCount(pts, 200)).toHaveLength(30);
  });

  it('never goes below 2 points', () => {
    const pts = noisyTrack(100);
    expect(simplifyToCount(pts, 0).length).toBeGreaterThanOrEqual(2);
  });
});
