import { describe, expect, it } from 'vitest';
import { escapeXml, serializeGpx, stopExportName } from '../../src/lib/gpx/serialize';
import { makeRoute, makeStop, MELBOURNE_STOPS } from './helpers';

const NOW = new Date('2026-07-08T04:00:00.000Z');

describe('escapeXml', () => {
  it('escapes the five XML specials', () => {
    expect(escapeXml(`Fish & Chips <"best"> 'shop'`)).toBe(
      'Fish &amp; Chips &lt;&quot;best&quot;&gt; &apos;shop&apos;'
    );
  });
});

describe('stopExportName', () => {
  it('uses the custom name when set', () => {
    expect(stopExportName(makeStop({ lat: 0, lon: 0, name: 'Fed Square' }), 3)).toBe('Fed Square');
  });
  it('defaults to positional Stop N', () => {
    expect(stopExportName(makeStop({ lat: 0, lon: 0 }), 3)).toBe('Stop 4');
    expect(stopExportName(makeStop({ lat: 0, lon: 0, name: '   ' }), 0)).toBe('Stop 1');
  });
});

describe('serializeGpx', () => {
  const route = makeRoute({ name: 'Melbourne CBD Loop', stops: MELBOURNE_STOPS });

  it('produces a GPX 1.1 document with the WayPoint creator', () => {
    const xml = serializeGpx(route, { now: NOW });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('version="1.1"');
    expect(xml).toContain('creator="WayPoint"');
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(xml).toContain('<time>2026-07-08T04:00:00Z</time>');
  });

  it('emits both wpt and rte by default (dual output, §4.1)', () => {
    const xml = serializeGpx(route, { now: NOW });
    expect(xml.match(/<wpt /g)).toHaveLength(4);
    expect(xml.match(/<rtept /g)).toHaveLength(4);
    expect(xml).toContain('<rte>');
  });

  it('respects the route-only and waypoints-only variants', () => {
    const routeOnly = serializeGpx(route, { now: NOW, variant: 'route-only' });
    expect(routeOnly).not.toContain('<wpt ');
    expect(routeOnly.match(/<rtept /g)).toHaveLength(4);
    const wptOnly = serializeGpx(route, { now: NOW, variant: 'waypoints-only' });
    expect(wptOnly.match(/<wpt /g)).toHaveLength(4);
    expect(wptOnly).not.toContain('<rte>');
  });

  it('renders coordinates with 6 decimal places', () => {
    const xml = serializeGpx(route, { now: NOW });
    expect(xml).toContain('lat="-37.815340" lon="144.966249"');
  });

  it('carries stop notes as <desc> on wpt and rtept', () => {
    const xml = serializeGpx(route, { now: NOW });
    expect(xml.match(/<desc>Meet at the big screen<\/desc>/g)).toHaveLength(2);
  });

  it('names unnamed stops positionally', () => {
    const anon = makeRoute({ stops: [makeStop({ lat: 1, lon: 2 }), makeStop({ lat: 3, lon: 4 })] });
    const xml = serializeGpx(anon, { now: NOW });
    expect(xml).toContain('<name>Stop 1</name>');
    expect(xml).toContain('<name>Stop 2</name>');
  });

  it('closes the route when loop=true: extra rtept, no extra wpt, "(return)" suffix', () => {
    const looped = makeRoute({ name: 'Loop', stops: MELBOURNE_STOPS, loop: true });
    const xml = serializeGpx(looped, { now: NOW });
    expect(xml.match(/<wpt /g)).toHaveLength(4);
    expect(xml.match(/<rtept /g)).toHaveLength(5);
    expect(xml).toContain('<name>Flinders Street Station (return)</name>');
    const rteptLats = [...xml.matchAll(/<rtept lat="([^"]+)"/g)].map((m) => m[1]);
    expect(rteptLats[4]).toBe(rteptLats[0]);
  });

  it('does not close a loop with fewer than 2 stops', () => {
    const single = makeRoute({ stops: [MELBOURNE_STOPS[0]!], loop: true });
    const xml = serializeGpx(single, { now: NOW });
    expect(xml.match(/<rtept /g)).toHaveLength(1);
  });

  it('escapes route and stop names', () => {
    const nasty = makeRoute({
      name: 'A & B <route>',
      stops: [makeStop({ lat: 1, lon: 2, name: `Joe's "Bar" & Grill` })]
    });
    const xml = serializeGpx(nasty, { now: NOW });
    expect(xml).toContain('<name>A &amp; B &lt;route&gt;</name>');
    expect(xml).toContain('&apos;');
    expect(xml).toContain('&quot;');
    expect(xml).not.toMatch(/<name>[^<]*&(?!(amp|lt|gt|quot|apos);)/);
  });

  it('defaults an empty route name', () => {
    const unnamed = makeRoute({ name: '  ' });
    expect(serializeGpx(unnamed, { now: NOW })).toContain('<name>Untitled route</name>');
  });

  it('includes the description only when present', () => {
    const withDesc = makeRoute({ description: 'Sunday walk' });
    expect(serializeGpx(withDesc, { now: NOW })).toContain('<desc>Sunday walk</desc>');
    expect(serializeGpx(makeRoute(), { now: NOW })).not.toContain('<desc>');
  });
});
