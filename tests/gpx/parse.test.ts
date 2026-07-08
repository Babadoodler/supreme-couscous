// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { GpxParseError, parseGpx } from '../../src/lib/gpx/parse';

const WPT_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Stops only</name></metadata>
  <wpt lat="-37.8153" lon="144.9662"><name>Flinders</name><desc>Start here</desc></wpt>
  <wpt lat="-37.8180" lon="144.9683"><name>Fed Square</name></wpt>
</gpx>`;

const RTE_ONLY = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>River walk</name>
    <desc>Along the Yarra</desc>
    <rtept lat="-37.8200" lon="144.9600"><name>A</name></rtept>
    <rtept lat="-37.8210" lon="144.9650"><name>B</name></rtept>
    <rtept lat="-37.8220" lon="144.9700"><name>C</name></rtept>
  </rte>
</gpx>`;

const GPX_10_TRK = `<?xml version="1.0"?>
<gpx version="1.0" creator="old-device" xmlns="http://www.topografix.com/GPX/1/0">
  <name>Morning run</name>
  <trk>
    <trkseg>
      <trkpt lat="-37.80" lon="144.95"></trkpt>
      <trkpt lat="-37.81" lon="144.96"></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="-37.82" lon="144.97"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const NO_NAMESPACE = `<?xml version="1.0"?>
<gpx version="1.1" creator="sloppy">
  <wpt lat="1.5" lon="2.5"><name>Bare</name></wpt>
</gpx>`;

describe('parseGpx basics', () => {
  it('parses a wpt-only file', () => {
    const { routes, warnings } = parseGpx(WPT_ONLY);
    expect(warnings).toEqual([]);
    expect(routes).toHaveLength(1);
    const r = routes[0]!;
    expect(r.sourceKind).toBe('wpt');
    expect(r.name).toBe('Stops only');
    expect(r.points).toHaveLength(2);
    expect(r.points[0]).toEqual({ lat: -37.8153, lon: 144.9662, name: 'Flinders', note: 'Start here' });
  });

  it('parses an rte-only file with route name and description', () => {
    const { routes } = parseGpx(RTE_ONLY);
    expect(routes).toHaveLength(1);
    const r = routes[0]!;
    expect(r.sourceKind).toBe('rte');
    expect(r.name).toBe('River walk');
    expect(r.description).toBe('Along the Yarra');
    expect(r.points.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect(r.loop).toBe(false);
  });

  it('flattens multi-segment GPX 1.0 tracks and reads the 1.0 root name', () => {
    const { routes } = parseGpx(GPX_10_TRK);
    expect(routes).toHaveLength(1);
    const r = routes[0]!;
    expect(r.sourceKind).toBe('trk');
    expect(r.name).toBe('Morning run');
    expect(r.points).toHaveLength(3);
    expect(r.points[2]!.lat).toBeCloseTo(-37.82);
  });

  it('accepts files without a namespace', () => {
    const { routes } = parseGpx(NO_NAMESPACE);
    expect(routes[0]!.points[0]!.name).toBe('Bare');
  });

  it('strips a UTF-8 BOM', () => {
    const { routes } = parseGpx('﻿' + WPT_ONLY);
    expect(routes).toHaveLength(1);
  });

  it('uses the fallback name when the file has none', () => {
    const anon = NO_NAMESPACE;
    const { routes } = parseGpx(anon, { fallbackName: 'my-upload.gpx route' });
    expect(routes[0]!.name).toBe('my-upload.gpx route');
  });
});

describe('loop detection', () => {
  it('detects a closed rte and drops the closing duplicate', () => {
    const closed = `<?xml version="1.0"?>
      <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1"><rte>
        <rtept lat="-37.820000" lon="144.960000"><name>A</name></rtept>
        <rtept lat="-37.821000" lon="144.965000"><name>B</name></rtept>
        <rtept lat="-37.820000" lon="144.960000"><name>A (return)</name></rtept>
      </rte></gpx>`;
    const { routes } = parseGpx(closed);
    expect(routes[0]!.loop).toBe(true);
    expect(routes[0]!.points).toHaveLength(2);
    expect(routes[0]!.points.map((p) => p.name)).toEqual(['A', 'B']);
  });

  it('does not treat a 2-point out-and-back as a loop', () => {
    const twoPt = `<?xml version="1.0"?>
      <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1"><rte>
        <rtept lat="-37.82" lon="144.96"/>
        <rtept lat="-37.83" lon="144.97"/>
      </rte></gpx>`;
    expect(parseGpx(twoPt).routes[0]!.loop).toBe(false);
  });
});

describe('multi-route files', () => {
  const multi = `<?xml version="1.0"?>
    <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
      <rte><name>One</name><rtept lat="1" lon="1"/></rte>
      <rte><name>Two</name><rtept lat="2" lon="2"/></rte>
      <trk><name>Three</name><trkseg><trkpt lat="3" lon="3"/></trkseg></trk>
    </gpx>`;
  it('imports each rte and trk as its own route', () => {
    const { routes } = parseGpx(multi);
    expect(routes.map((r) => r.name)).toEqual(['One', 'Two', 'Three']);
    expect(routes.map((r) => r.sourceKind)).toEqual(['rte', 'rte', 'trk']);
  });
});

describe('dual-output recognition', () => {
  it('does not warn when wpts mirror the single rte (WayPoint-style export)', () => {
    const dual = `<?xml version="1.0"?>
      <gpx version="1.1" creator="WayPoint" xmlns="http://www.topografix.com/GPX/1/1">
        <wpt lat="1.000000" lon="2.000000"><name>A</name></wpt>
        <wpt lat="3.000000" lon="4.000000"><name>B</name></wpt>
        <rte><name>R</name>
          <rtept lat="1.000000" lon="2.000000"><name>A</name></rtept>
          <rtept lat="3.000000" lon="4.000000"><name>B</name></rtept>
        </rte>
      </gpx>`;
    const { routes, warnings } = parseGpx(dual);
    expect(routes).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('warns when standalone waypoints differ from the routes', () => {
    const mixed = `<?xml version="1.0"?>
      <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
        <wpt lat="9" lon="9"><name>Lone</name></wpt>
        <rte><rtept lat="1" lon="1"/><rtept lat="2" lon="2"/></rte>
      </gpx>`;
    const { routes, warnings } = parseGpx(mixed);
    expect(routes).toHaveLength(1);
    expect(warnings.some((w) => w.includes('Ignored 1 standalone waypoint'))).toBe(true);
  });
});

describe('tolerance and errors — never fail silently', () => {
  it('skips points with invalid coordinates and says so', () => {
    const bad = `<?xml version="1.0"?>
      <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
        <wpt lat="91" lon="0"><name>Too far north</name></wpt>
        <wpt lat="abc" lon="1"><name>Garbage</name></wpt>
        <wpt lat="-37.8" lon="144.9"><name>Fine</name></wpt>
      </gpx>`;
    const { routes, warnings } = parseGpx(bad);
    expect(routes[0]!.points).toHaveLength(1);
    expect(warnings).toHaveLength(2);
  });

  it('throws GpxParseError for empty input', () => {
    expect(() => parseGpx('')).toThrow(GpxParseError);
    expect(() => parseGpx('  \n ')).toThrow(GpxParseError);
  });

  it('throws GpxParseError for non-XML', () => {
    expect(() => parseGpx('not xml at all')).toThrow(GpxParseError);
  });

  it('throws GpxParseError for XML that is not GPX', () => {
    expect(() => parseGpx('<kml xmlns="http://www.opengis.net/kml/2.2"></kml>')).toThrow(
      /not GPX/
    );
  });

  it('throws GpxParseError for GPX with no points at all', () => {
    expect(() => parseGpx('<gpx version="1.1" creator="t"></gpx>')).toThrow(/no waypoints/);
  });

  it('reports empty routes via warnings and filters them out', () => {
    const emptyRte = `<?xml version="1.0"?>
      <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
        <rte><name>Empty</name></rte>
        <rte><name>Full</name><rtept lat="1" lon="1"/></rte>
      </gpx>`;
    const { routes, warnings } = parseGpx(emptyRte);
    expect(routes.map((r) => r.name)).toEqual(['Full']);
    expect(warnings.some((w) => w.includes('"Empty"'))).toBe(true);
  });
});
