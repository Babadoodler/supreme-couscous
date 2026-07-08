import { describe, expect, it } from 'vitest';
import { normalizeLon, parseCoordinateInput } from '../../src/lib/geo/coordParse';

const MEL = { lat: -37.8136, lon: 144.9631 };

function expectClose(input: string, lat: number, lon: number) {
  const p = parseCoordinateInput(input);
  expect(p, `should parse: ${input}`).not.toBeNull();
  expect(p!.lat).toBeCloseTo(lat, 4);
  expect(p!.lon).toBeCloseTo(lon, 4);
}

describe('decimal pairs', () => {
  it('parses comma-separated decimals', () => expectClose('-37.8136, 144.9631', MEL.lat, MEL.lon));
  it('parses without space after comma', () => expectClose('-37.8136,144.9631', MEL.lat, MEL.lon));
  it('parses semicolon-separated decimals', () => expectClose('-37.8136; 144.9631', MEL.lat, MEL.lon));
  it('parses space-separated decimals', () => expectClose('-37.8136 144.9631', MEL.lat, MEL.lon));
  it('parses positive pairs', () => expectClose('51.5007, -0.1246', 51.5007, -0.1246));
  it('parses integers', () => expectClose('40, 75', 40, 75));
  it('tolerates surrounding whitespace', () => expectClose('  -37.8136 , 144.9631  ', MEL.lat, MEL.lon));
  it('parses explicit plus signs', () => expectClose('+40.7128, -74.0060', 40.7128, -74.006));
});

describe('hemisphere-suffixed decimals', () => {
  it('parses "37.8136° S, 144.9631° E"', () => expectClose('37.8136° S, 144.9631° E', MEL.lat, MEL.lon));
  it('parses "37.8136S 144.9631E"', () => expectClose('37.8136S 144.9631E', MEL.lat, MEL.lon));
  it('parses "37.8136 S, 144.9631 E"', () => expectClose('37.8136 S, 144.9631 E', MEL.lat, MEL.lon));
  it('parses lon-first when hemispheres say so', () => expectClose('144.9631 E, 37.8136 S', MEL.lat, MEL.lon));
  it('parses hemisphere prefixes', () => expectClose('S 37.8136, E 144.9631', MEL.lat, MEL.lon));
  it('parses N/W pairs', () => expectClose('40.7128 N, 74.0060 W', 40.7128, -74.006));
  it('rejects two latitudes', () => expect(parseCoordinateInput('37.8 S, 40.0 N')).toBeNull());
  it('rejects two longitudes', () => expect(parseCoordinateInput('144.9 E, 20.0 W')).toBeNull());
});

describe('DMS and DDM', () => {
  it('parses DMS with symbols', () => expectClose(`37°48'49"S 144°57'47"E`, -37.81361, 144.96306));
  it('parses DMS with comma separator', () => expectClose(`37°48'49"S, 144°57'47"E`, -37.81361, 144.96306));
  it('parses DMS with unicode prime marks', () => expectClose('37°48′49″S 144°57′47″E', -37.81361, 144.96306));
  it('parses DMS with spaces around parts', () => expectClose(`37° 48' 49" S, 144° 57' 47" E`, -37.81361, 144.96306));
  it('parses decimal seconds', () => expectClose(`37°48'48.96"S 144°57'47.16"E`, -37.8136, 144.9631));
  it('parses DDM (degrees + decimal minutes)', () => expectClose(`37°48.816'S 144°57.786'E`, -37.8136, 144.9631));
  it('parses signed DMS without hemisphere', () => expectClose(`-37°48'49", 144°57'47"`, -37.81361, 144.96306));
  it('rejects minutes ≥ 60', () => expect(parseCoordinateInput(`37°75'S 144°57'E`)).toBeNull());
  it('rejects seconds ≥ 60', () => expect(parseCoordinateInput(`37°48'75"S 144°57'47"E`)).toBeNull());
  it('rejects sign+hemisphere conflicts', () => expect(parseCoordinateInput('S -37.8, E 144.9')).toBeNull());
});

describe('geo: URIs', () => {
  it('parses a bare geo URI', () => expectClose('geo:-37.8136,144.9631', MEL.lat, MEL.lon));
  it('parses geo URI with zoom query', () => expectClose('geo:-37.8136,144.9631?z=17', MEL.lat, MEL.lon));
  it('parses geo URI with uncertainty', () => expectClose('geo:-37.8136,144.9631;u=35', MEL.lat, MEL.lon));
  it('is case-insensitive on the scheme', () => expectClose('GEO:-37.8136,144.9631', MEL.lat, MEL.lon));
});

describe('map URLs', () => {
  it('parses @lat,lon Google Maps URLs', () =>
    expectClose('https://www.google.com/maps/@-37.8136,144.9631,15z', MEL.lat, MEL.lon));
  it('parses place URLs with @', () =>
    expectClose('https://www.google.com/maps/place/Flinders+Street/@-37.8183,144.9671,17z/data=xyz', -37.8183, 144.9671));
  it('parses q= URLs', () => expectClose('https://maps.google.com/?q=-37.8136,144.9631', MEL.lat, MEL.lon));
  it('parses query= URLs', () =>
    expectClose('https://www.google.com/maps/search/?api=1&query=-37.8136%2C144.9631', MEL.lat, MEL.lon));
  it('parses ll= URLs', () => expectClose('https://maps.apple.com/?ll=-37.8136,144.9631', MEL.lat, MEL.lon));
  it('returns null for short links without coordinates', () =>
    expect(parseCoordinateInput('https://maps.app.goo.gl/AbCdEf123')).toBeNull());
  it('returns null for non-map URLs', () =>
    expect(parseCoordinateInput('https://example.com/article')).toBeNull());
});

describe('garbage and search queries', () => {
  const searches = [
    '',
    '   ',
    'Flinders Street Station',
    'coffee near me',
    '7-Eleven Swanston St',
    '42',
    '-37.8136',
    'lat lon',
    '99.9, 144.9', // latitude out of range
    '37.8, 999.9, 12.2', // three numbers
    'a'.repeat(600)
  ];
  for (const q of searches) {
    it(`returns null for ${JSON.stringify(q.slice(0, 40))}`, () =>
      expect(parseCoordinateInput(q)).toBeNull());
  }
});

describe('range handling', () => {
  it('rejects latitude beyond ±90', () => expect(parseCoordinateInput('91, 10')).toBeNull());
  it('accepts the poles', () => expectClose('90, 0', 90, 0));
  it('normalises longitude beyond ±180 is not applied to plain pairs beyond regex range', () => {
    // 3-digit lon up to 180 goes through; beyond ±180 wraps via normalizeLon
    expectClose('10, 190', 10, -170);
  });
  it('normalizeLon wraps correctly', () => {
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(-190)).toBe(170);
    expect(normalizeLon(360)).toBe(0);
    expect(normalizeLon(180)).toBe(180);
    expect(normalizeLon(-180)).toBe(-180);
  });
});
