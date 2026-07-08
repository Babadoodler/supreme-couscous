import { describe, expect, it } from 'vitest';
import { buildMarkdown, estimateWalkMinutes } from '../src/lib/overview';
import { fitPointsToBox } from '../src/lib/geo/project';
import { makeRoute, makeStop, MELBOURNE_STOPS } from './gpx/helpers';

describe('estimateWalkMinutes', () => {
  it('uses a 12 min/km pace', () => {
    expect(estimateWalkMinutes(1000)).toBe(12);
    expect(estimateWalkMinutes(2500)).toBe(30);
  });
  it('floors at 1 minute for any positive distance', () => {
    expect(estimateWalkMinutes(20)).toBe(1);
  });
  it('returns 0 for zero distance', () => {
    expect(estimateWalkMinutes(0)).toBe(0);
  });
});

describe('buildMarkdown', () => {
  const route = makeRoute({
    name: 'Melbourne CBD Loop',
    description: 'A stroll through the CBD',
    stops: MELBOURNE_STOPS,
    loop: true
  });

  it('includes title, description and stats', () => {
    const md = buildMarkdown(route);
    expect(md).toContain('# Melbourne CBD Loop');
    expect(md).toContain('A stroll through the CBD');
    expect(md).toContain('- **Stops:** 4');
    expect(md).toMatch(/- \*\*Distance:\*\* .+ straight-line · ~\d+ min walk/);
    expect(md).toContain('- **Loop:** yes — returns to start');
    expect(md).toContain('- **Start:** Flinders Street Station');
    expect(md).toContain('- **End:** Sea Life Melbourne');
  });

  it('renders the coordinates table with 6-decimal coords', () => {
    const md = buildMarkdown(route);
    expect(md).toContain('| # | Stop | Latitude | Longitude | Note |');
    expect(md).toContain('| 1 | Flinders Street Station | -37.815340 | 144.966249 |');
    expect(md).toContain('| 2 | Federation Square | -37.817979 | 144.968280 | Meet at the big screen |');
  });

  it('escapes pipes and newlines in names and notes', () => {
    const tricky = makeRoute({
      name: 'Tricky',
      stops: [makeStop({ lat: 1, lon: 2, name: 'A | B', note: 'line1\nline2' })]
    });
    const md = buildMarkdown(tricky);
    expect(md).toContain('A \\| B');
    expect(md).toContain('line1 line2');
  });

  it('names unnamed stops positionally and handles single-stop routes', () => {
    const single = makeRoute({ name: 'One', stops: [makeStop({ lat: 1, lon: 2 })] });
    const md = buildMarkdown(single);
    expect(md).toContain('- **Start:** Stop 1');
    expect(md).not.toContain('- **End:**');
    expect(md).not.toContain('- **Distance:**');
  });
});

describe('fitPointsToBox', () => {
  it('returns empty for no points', () => {
    expect(fitPointsToBox([], 100, 100, 10)).toEqual([]);
  });

  it('keeps all projected points inside the padded box', () => {
    const pts = fitPointsToBox(MELBOURNE_STOPS, 360, 240, 20);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(340 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(p.y).toBeLessThanOrEqual(220 + 1e-6);
    }
  });

  it('uses uniform scale (aspect preserved)', () => {
    // Two points on the same latitude: dy must be 0.
    const pts = fitPointsToBox(
      [
        { lat: 10, lon: 20 },
        { lat: 10, lon: 21 }
      ],
      200,
      100,
      10
    );
    expect(Math.abs(pts[0]!.y - pts[1]!.y)).toBeLessThan(1e-9);
  });

  it('centres a single point', () => {
    const [p] = fitPointsToBox([{ lat: 5, lon: 5 }], 100, 80, 10);
    expect(p!.x).toBeCloseTo(50, 5);
    expect(p!.y).toBeCloseTo(40, 5);
  });
});
