// Coordinate input parsing (DESIGN.md §7.1.1).
// Accepts, in priority order: geo: URIs, map-service URLs containing
// coordinates, DMS/DDM strings, and plain decimal pairs. Returns null when
// the input does not look like coordinates (callers then treat it as a
// search query). Pure module: no DOM, no framework imports.

import type { LatLon } from '../types';

export function isValidLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLon(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

/** Normalise a longitude into [-180, 180). Applied on input, never on export. */
export function normalizeLon(lon: number): number {
  if (!Number.isFinite(lon)) return lon;
  const n = ((lon + 180) % 360 + 360) % 360 - 180;
  // Keep +180 as +180 rather than mapping it to -180.
  return n === -180 && lon > 0 ? 180 : n;
}

function result(lat: number, lon: number): LatLon | null {
  lon = normalizeLon(lon);
  if (!isValidLat(lat) || !isValidLon(lon)) return null;
  return { lat, lon };
}

const DEC = String.raw`[+-]?\d{1,3}(?:\.\d+)?`;

/** geo:lat,lon URIs, e.g. "geo:-37.8136,144.9631?z=17" or with ;u= params. */
function parseGeoUri(input: string): LatLon | null {
  const m = input.match(new RegExp(String.raw`^geo:(${DEC}),(${DEC})(?:[;?,].*)?$`, 'i'));
  if (!m) return null;
  return result(Number(m[1]), Number(m[2]));
}

/**
 * Map-service URLs that embed coordinates, e.g.
 *  https://www.google.com/maps/@-37.8136,144.9631,15z
 *  https://www.google.com/maps?q=-37.8136,144.9631
 *  https://maps.google.com/?query=-37.8136,144.9631
 *  .../maps/place/Somewhere/@-37.8,144.9,17z
 * Short links (maps.app.goo.gl) carry no coordinates and are not resolved.
 */
function parseMapUrl(input: string): LatLon | null {
  if (!/^https?:\/\//i.test(input)) return null;
  const at = input.match(new RegExp(String.raw`@(${DEC}),(${DEC})`));
  if (at) return result(Number(at[1]), Number(at[2]));
  const q = input.match(new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=(${DEC})(?:,|%2C)(${DEC})`, 'i'));
  if (q) return result(Number(q[1]), Number(q[2]));
  return null;
}

// One DMS/DDM/decimal-with-hemisphere component, e.g.:
//   37°48'49.2"S   37° 48.82' S   37.8136°S   S37°48'49"   37.8136 S
// Minute/second markers must be symbols ('/″ etc.), not letters — a letter
// marker like "49s" is indistinguishable from a hemisphere suffix.
const HEMI = `([NSEW])`;
const DMS_CORE = String.raw`(\d{1,3}(?:\.\d+)?)\s*(?:°|º)?\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:'|′|’)\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|”|'')\s*)?`;
const DMS_PART = new RegExp(
  String.raw`^\s*(?:${HEMI}\s*)?([+-])?${DMS_CORE}(?:${HEMI})?\s*$`,
  'i'
);

interface HemiValue {
  value: number;
  hemi: 'N' | 'S' | 'E' | 'W' | null;
}

function parseDmsPart(part: string): HemiValue | null {
  const m = part.match(DMS_PART);
  if (!m) return null;
  const [, hemiBefore, sign, deg, min, sec, hemiAfter] = m;
  if (hemiBefore && hemiAfter) return null;
  const hemi = ((hemiBefore || hemiAfter) ?? null)?.toUpperCase() as HemiValue['hemi'];
  if (hemi && sign) return null; // "S -37°" is ambiguous — reject
  let value = Number(deg) + (min ? Number(min) / 60 : 0) + (sec ? Number(sec) / 3600 : 0);
  if (min && Number(min) >= 60) return null;
  if (sec && Number(sec) >= 60) return null;
  if (sign === '-' || hemi === 'S' || hemi === 'W') value = -value;
  return { value, hemi };
}

/** Split a two-coordinate string on comma/semicolon, or on whitespace as a fallback. */
function splitPair(input: string): [string, string] | null {
  for (const sep of [',', ';']) {
    const idx = input.indexOf(sep);
    if (idx > 0 && input.indexOf(sep, idx + 1) === -1) {
      return [input.slice(0, idx), input.slice(idx + 1)];
    }
  }
  return null;
}

function combine(a: HemiValue, b: HemiValue): LatLon | null {
  // Hemisphere letters decide which component is which; default is lat,lon.
  const aIsLon = a.hemi === 'E' || a.hemi === 'W';
  const bIsLat = b.hemi === 'N' || b.hemi === 'S';
  if (a.hemi && b.hemi) {
    const aAxis = a.hemi === 'N' || a.hemi === 'S' ? 'lat' : 'lon';
    const bAxis = b.hemi === 'N' || b.hemi === 'S' ? 'lat' : 'lon';
    if (aAxis === bAxis) return null;
  }
  if (aIsLon || (bIsLat && !a.hemi)) return result(b.value, a.value);
  return result(a.value, b.value);
}

function parsePairString(input: string): LatLon | null {
  const split = splitPair(input);
  if (split) {
    const a = parseDmsPart(split[0]);
    const b = parseDmsPart(split[1]);
    if (a && b) return combine(a, b);
    return null;
  }
  // Whitespace-separated: try every single split point until one parses.
  const tokens = input.trim().split(/\s+/);
  for (let i = 1; i < tokens.length; i++) {
    const a = parseDmsPart(tokens.slice(0, i).join(' '));
    const b = parseDmsPart(tokens.slice(i).join(' '));
    if (a && b) return combine(a, b);
  }
  return null;
}

/**
 * Parse any supported coordinate input. Returns null if the string does not
 * parse as coordinates — the add bar then treats it as a search query.
 */
export function parseCoordinateInput(raw: string): LatLon | null {
  const input = raw.trim();
  if (input.length === 0 || input.length > 500) return null;
  return parseGeoUri(input) ?? parseMapUrl(input) ?? parsePairString(input);
}
