// @vitest-environment jsdom
// The DESIGN.md §13 invariant: parse(serialize(route)) ≡ route.
// Identity is modulo regenerated ids/timestamps; stop names compare against
// their export names (empty names export as "Stop N" by design, §4.3).
import { describe, expect, it } from 'vitest';
import { serializeGpx, stopExportName } from '../../src/lib/gpx/serialize';
import { parseGpx } from '../../src/lib/gpx/parse';
import type { Route } from '../../src/lib/types';
import { makeRoute, makeStop, MELBOURNE_STOPS } from './helpers';

function expectRoundTrip(route: Route) {
  const { routes, warnings } = parseGpx(serializeGpx(route));
  expect(warnings).toEqual([]);
  expect(routes).toHaveLength(1);
  const back = routes[0]!;
  expect(back.name).toBe(route.name.trim() || 'Untitled route');
  expect(back.description).toBe(route.description.trim());
  expect(back.loop).toBe(route.loop);
  expect(back.points).toHaveLength(route.stops.length);
  route.stops.forEach((stop, i) => {
    const p = back.points[i]!;
    expect(p.lat).toBeCloseTo(stop.lat, 6);
    expect(p.lon).toBeCloseTo(stop.lon, 6);
    expect(p.name).toBe(stopExportName(stop, i));
    expect(p.note).toBe(stop.note.trim());
  });
}

describe('round-trip invariant', () => {
  it('holds for a plain named route', () => {
    expectRoundTrip(makeRoute({ name: 'Melbourne CBD', stops: MELBOURNE_STOPS }));
  });

  it('holds for a looped route', () => {
    expectRoundTrip(makeRoute({ name: 'CBD Loop', stops: MELBOURNE_STOPS, loop: true }));
  });

  it('holds with unnamed stops and a description', () => {
    expectRoundTrip(
      makeRoute({
        name: 'Anon stops',
        description: 'Mixed naming',
        stops: [
          makeStop({ lat: -37.1, lon: 144.1 }),
          makeStop({ lat: -37.2, lon: 144.2, name: 'Named one', note: 'with a note' }),
          makeStop({ lat: -37.3, lon: 144.3 })
        ]
      })
    );
  });

  it('holds with XML-hostile names', () => {
    expectRoundTrip(
      makeRoute({
        name: `<Route> & "Friends"`,
        stops: [
          makeStop({ lat: 1, lon: 2, name: `Joe's "Bar" & <Grill>`, note: 'a < b && c > d' }),
          makeStop({ lat: 3, lon: 4, name: 'Ünïcodé 🗺️ 停留所' })
        ]
      })
    );
  });

  it('holds for the route-only variant', () => {
    const route = makeRoute({ name: 'RteOnly', stops: MELBOURNE_STOPS, loop: true });
    const { routes } = parseGpx(serializeGpx(route, { variant: 'route-only' }));
    expect(routes[0]!.points).toHaveLength(4);
    expect(routes[0]!.loop).toBe(true);
  });

  it('holds for the waypoints-only variant (order preserved, loop not representable)', () => {
    const route = makeRoute({ name: 'WptOnly', stops: MELBOURNE_STOPS });
    const { routes } = parseGpx(serializeGpx(route, { variant: 'waypoints-only' }));
    expect(routes[0]!.sourceKind).toBe('wpt');
    expect(routes[0]!.points.map((p) => p.name)).toEqual(
      route.stops.map((s, i) => stopExportName(s, i))
    );
  });

  it('holds across many generated routes', () => {
    // Deterministic pseudo-random sweep — cheap property test.
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let n = 0; n < 25; n++) {
      const stopCount = 2 + Math.floor(rand() * 8);
      const stops = Array.from({ length: stopCount }, (_, i) =>
        makeStop({
          lat: Math.round((rand() * 180 - 90) * 1e6) / 1e6,
          lon: Math.round((rand() * 360 - 180) * 1e6) / 1e6,
          name: rand() > 0.3 ? `Stop name ${n}-${i} & <co>` : '',
          note: rand() > 0.7 ? `note "${n}"` : ''
        })
      );
      expectRoundTrip(makeRoute({ name: `Generated ${n}`, stops, loop: rand() > 0.5 }));
    }
  });
});
