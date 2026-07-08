// Tolerant GPX importer (DESIGN.md §4.4, §10).
// Accepts GPX 1.0/1.1, wpt-only, rte-only and trk files; never fails
// silently — unparseable input throws GpxParseError, recoverable oddities
// are reported as warnings.
//
// Uses the standard DOMParser global (per DESIGN.md §12.1); tests run it
// under jsdom. No framework imports.

export interface ParsedPoint {
  lat: number;
  lon: number;
  name: string;
  note: string;
}

export type ParsedSourceKind = 'wpt' | 'rte' | 'trk';

export interface ParsedRoute {
  name: string;
  description: string;
  points: ParsedPoint[];
  loop: boolean;
  sourceKind: ParsedSourceKind;
}

export interface ParseResult {
  routes: ParsedRoute[];
  warnings: string[];
}

export class GpxParseError extends Error {}

function childrenByLocalName(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name);
}

function childText(el: Element, name: string): string {
  const c = childrenByLocalName(el, name)[0];
  return c?.textContent?.trim() ?? '';
}

function coordsEqual(a: { lat: number; lon: number }, b: { lat: number; lon: number }): boolean {
  return a.lat.toFixed(6) === b.lat.toFixed(6) && a.lon.toFixed(6) === b.lon.toFixed(6);
}

function parsePoint(el: Element, warnings: string[], context: string): ParsedPoint | null {
  const lat = Number(el.getAttribute('lat'));
  const lon = Number(el.getAttribute('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    warnings.push(`Skipped a ${context} point with invalid coordinates (lat="${el.getAttribute('lat')}", lon="${el.getAttribute('lon')}")`);
    return null;
  }
  return { lat, lon, name: childText(el, 'name'), note: childText(el, 'desc') };
}

/**
 * Detect a closed route: last point at the first point's coordinates.
 * Returns the points without the closing duplicate, plus the loop flag.
 */
function extractLoop(points: ParsedPoint[]): { points: ParsedPoint[]; loop: boolean } {
  if (points.length >= 3 && coordsEqual(points[0]!, points[points.length - 1]!)) {
    return { points: points.slice(0, -1), loop: true };
  }
  return { points, loop: false };
}

export function parseGpx(xml: string, options: { fallbackName?: string } = {}): ParseResult {
  const cleaned = xml.replace(/^\uFEFF/, '').trim();
  if (!cleaned) throw new GpxParseError('The file is empty.');

  const doc = new DOMParser().parseFromString(cleaned, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new GpxParseError("Couldn't read this file — it isn't valid XML.");
  }
  const gpx = doc.documentElement;
  if (gpx.localName !== 'gpx') {
    throw new GpxParseError(`This is an XML file but not GPX (root element is <${gpx.localName}>).`);
  }

  const warnings: string[] = [];
  const metadata = childrenByLocalName(gpx, 'metadata')[0];
  // GPX 1.1 keeps name/desc under <metadata>; GPX 1.0 puts them directly on <gpx>.
  const fileName = (metadata && childText(metadata, 'name')) || childText(gpx, 'name');
  const fileDesc = (metadata && childText(metadata, 'desc')) || childText(gpx, 'desc');
  const fallbackName = options.fallbackName?.trim() || 'Imported route';

  const wpts = childrenByLocalName(gpx, 'wpt')
    .map((el) => parsePoint(el, warnings, 'waypoint'))
    .filter((p): p is ParsedPoint => p !== null);

  const routes: ParsedRoute[] = [];

  for (const rte of childrenByLocalName(gpx, 'rte')) {
    const raw = childrenByLocalName(rte, 'rtept')
      .map((el) => parsePoint(el, warnings, 'route'))
      .filter((p): p is ParsedPoint => p !== null);
    const { points, loop } = extractLoop(raw);
    routes.push({
      name: childText(rte, 'name') || fileName || fallbackName,
      description: childText(rte, 'desc') || fileDesc,
      points,
      loop,
      sourceKind: 'rte'
    });
  }

  for (const trk of childrenByLocalName(gpx, 'trk')) {
    const raw = childrenByLocalName(trk, 'trkseg')
      .flatMap((seg) => childrenByLocalName(seg, 'trkpt'))
      .map((el) => parsePoint(el, warnings, 'track'))
      .filter((p): p is ParsedPoint => p !== null);
    const { points, loop } = extractLoop(raw);
    routes.push({
      name: childText(trk, 'name') || fileName || fallbackName,
      description: childText(trk, 'desc') || fileDesc,
      points,
      loop,
      sourceKind: 'trk'
    });
  }

  if (routes.length === 0) {
    if (wpts.length === 0) {
      throw new GpxParseError('This GPX file contains no waypoints, routes or tracks.');
    }
    routes.push({
      name: fileName || fallbackName,
      description: fileDesc,
      points: wpts,
      loop: false,
      sourceKind: 'wpt'
    });
  } else if (wpts.length > 0) {
    // Dual-output files (like WayPoint's own exports) carry the same stops as
    // both <wpt>s and one <rte> — recognise that shape and don't warn.
    const single = routes.length === 1 ? routes[0]! : null;
    const isDualOutput =
      single !== null &&
      single.points.length === wpts.length &&
      single.points.every((p, i) => coordsEqual(p, wpts[i]!));
    if (!isDualOutput) {
      warnings.push(`Ignored ${wpts.length} standalone waypoint${wpts.length === 1 ? '' : 's'} — the file also contains ${routes.length === 1 ? 'a route' : 'routes'}.`);
    }
  }

  for (const r of routes) {
    if (r.points.length === 0) {
      warnings.push(`"${r.name}" contains no usable points.`);
    }
  }

  return { routes: routes.filter((r) => r.points.length > 0), warnings };
}
