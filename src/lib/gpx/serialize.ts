// GPX 1.1 serialiser (DESIGN.md §4). Pure module: builds the XML by hand —
// the format subset is tiny and a dependency adds risk, not value.
// Export NEVER mutates route data; coordinate normalisation happens on input.

import type { Route, Stop } from '../types';
import { formatCoord } from '../geo/format';

export type GpxVariant = 'full' | 'route-only' | 'waypoints-only';

export interface SerializeOptions {
  variant?: GpxVariant; // default 'full': waypoints + <rte> dual output (§4.1)
  /** Export timestamp; injectable for deterministic tests. */
  now?: Date;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Display/export name for a stop: custom name, else positional default (§4.3). */
export function stopExportName(stop: Stop, index: number): string {
  return stop.name.trim() || `Stop ${index + 1}`;
}

function wptTag(tag: 'wpt' | 'rtept', stop: Stop, index: number, indent: string): string {
  const open = `${indent}<${tag} lat="${formatCoord(stop.lat)}" lon="${formatCoord(stop.lon)}">`;
  const name = `<name>${escapeXml(stopExportName(stop, index))}</name>`;
  const desc = stop.note.trim() ? `<desc>${escapeXml(stop.note.trim())}</desc>` : '';
  // rtept keeps <desc> too so notes survive consumers (and re-imports) that
  // only read the <rte> element.
  if (tag === 'rtept') return `${open}${name}${desc}</${tag}>`;
  const inner = desc ? `\n${indent}  ${name}\n${indent}  ${desc}\n${indent}` : name;
  return `${open}${inner}</${tag}>`;
}

export function serializeGpx(route: Route, options: SerializeOptions = {}): string {
  const variant = options.variant ?? 'full';
  const now = options.now ?? new Date();
  const name = route.name.trim() || 'Untitled route';
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="WayPoint"',
    '     xmlns="http://www.topografix.com/GPX/1/1"',
    '     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${escapeXml(name)}</name>`
  ];
  if (route.description.trim()) {
    lines.push(`    <desc>${escapeXml(route.description.trim())}</desc>`);
  }
  lines.push(`    <time>${now.toISOString().replace(/\.\d{3}Z$/, 'Z')}</time>`, '  </metadata>');

  if (variant !== 'route-only') {
    for (const [i, stop] of route.stops.entries()) lines.push(wptTag('wpt', stop, i, '  '));
  }

  if (variant !== 'waypoints-only') {
    lines.push('  <rte>', `    <name>${escapeXml(name)}</name>`);
    for (const [i, stop] of route.stops.entries()) lines.push(wptTag('rtept', stop, i, '    '));
    // Loop: repeat the first point at the end; no duplicate <wpt> (§4.3).
    if (route.loop && route.stops.length >= 2) {
      const first = route.stops[0]!;
      const closing: Stop = { ...first, name: `${stopExportName(first, 0)} (return)` };
      lines.push(wptTag('rtept', closing, 0, '    '));
    }
    lines.push('  </rte>');
  }

  lines.push('</gpx>', '');
  return lines.join('\n');
}
