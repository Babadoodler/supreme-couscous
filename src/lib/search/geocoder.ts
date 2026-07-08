// Geocoder adapters (DESIGN.md §12.3): Photon primary, Nominatim fallback.
// UI code must only ever talk to the Geocoder interface — never the
// services directly — so a provider swap is a one-line change here.
// Network-only by design (§8): geocoding is never cached by the SW.

import type { LatLon } from '../types';

export interface GeocodeResult {
  name: string;
  locality: string;
  lat: number;
  lon: number;
}

export interface Geocoder {
  search(q: string, bias?: LatLon): Promise<GeocodeResult[]>;
  reverse(lat: number, lon: number): Promise<GeocodeResult | null>;
}

type FetchLike = (input: string | URL) => Promise<Response>;

const RESULT_LIMIT = 6;

function joinParts(parts: Array<string | undefined | null>): string {
  return [...new Set(parts.filter((p): p is string => !!p && p.trim().length > 0))].join(', ');
}

// ---------------------------------------------------------------- Photon

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

function photonToResult(f: PhotonFeature): GeocodeResult | null {
  const coords = f.geometry?.coordinates;
  const p = f.properties ?? {};
  if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  const street = p.street ? (p.housenumber ? `${p.housenumber} ${p.street}` : p.street) : '';
  const name = p.name || street || p.city || p.country || 'Unnamed place';
  const locality = joinParts([name === street ? '' : street, p.district, p.city, p.state, p.country].filter((x) => x !== name));
  return { name, locality, lat: coords[1], lon: coords[0] };
}

export class PhotonGeocoder implements Geocoder {
  constructor(
    private fetchFn: FetchLike = (u) => fetch(u),
    private base = 'https://photon.komoot.io'
  ) {}

  async search(q: string, bias?: LatLon): Promise<GeocodeResult[]> {
    const url = new URL(`${this.base}/api/`);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(RESULT_LIMIT));
    if (bias) {
      url.searchParams.set('lat', bias.lat.toFixed(4));
      url.searchParams.set('lon', bias.lon.toFixed(4));
    }
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`Photon search failed (${res.status})`);
    const json = (await res.json()) as { features?: PhotonFeature[] };
    return (json.features ?? []).map(photonToResult).filter((r): r is GeocodeResult => r !== null);
  }

  async reverse(lat: number, lon: number): Promise<GeocodeResult | null> {
    const url = new URL(`${this.base}/reverse`);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('limit', '1');
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`Photon reverse failed (${res.status})`);
    const json = (await res.json()) as { features?: PhotonFeature[] };
    return json.features?.[0] ? photonToResult(json.features[0]) : null;
  }
}

// ------------------------------------------------------------- Nominatim

interface NominatimItem {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
}

function nominatimToResult(item: NominatimItem): GeocodeResult | null {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const display = item.display_name ?? '';
  const [head, ...rest] = display.split(',').map((s) => s.trim());
  const name = item.name || head || 'Unnamed place';
  const locality = (item.name && display.startsWith(item.name) ? rest : display ? [head, ...rest].filter((p) => p !== name) : [])
    .slice(0, 3)
    .join(', ');
  return { name, locality, lat, lon };
}

export class NominatimGeocoder implements Geocoder {
  constructor(
    private fetchFn: FetchLike = (u) => fetch(u),
    private base = 'https://nominatim.openstreetmap.org'
  ) {}

  async search(q: string, bias?: LatLon): Promise<GeocodeResult[]> {
    const url = new URL(`${this.base}/search`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(RESULT_LIMIT));
    if (bias) {
      // Nominatim has no point bias; a viewbox around the bias point (not
      // bounded) gently prefers nearby results.
      const d = 0.3;
      url.searchParams.set(
        'viewbox',
        [bias.lon - d, bias.lat + d, bias.lon + d, bias.lat - d].map((n) => n.toFixed(4)).join(',')
      );
    }
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`Nominatim search failed (${res.status})`);
    const json = (await res.json()) as NominatimItem[];
    return json.map(nominatimToResult).filter((r): r is GeocodeResult => r !== null);
  }

  async reverse(lat: number, lon: number): Promise<GeocodeResult | null> {
    const url = new URL(`${this.base}/reverse`);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`Nominatim reverse failed (${res.status})`);
    const json = (await res.json()) as NominatimItem & { error?: string };
    if (json.error) return null;
    return nominatimToResult(json);
  }
}

// ------------------------------------------------------------- Fallback

/** Primary that throws falls through to the secondary (§12.3). */
export class FallbackGeocoder implements Geocoder {
  constructor(
    private primary: Geocoder,
    private secondary: Geocoder
  ) {}

  async search(q: string, bias?: LatLon): Promise<GeocodeResult[]> {
    try {
      return await this.primary.search(q, bias);
    } catch {
      return this.secondary.search(q, bias);
    }
  }

  async reverse(lat: number, lon: number): Promise<GeocodeResult | null> {
    try {
      return await this.primary.reverse(lat, lon);
    } catch {
      try {
        return await this.secondary.reverse(lat, lon);
      } catch {
        return null; // reverse results are only ever suggestions — never fatal
      }
    }
  }
}

/** App-wide instance. */
export const geocoder: Geocoder = new FallbackGeocoder(new PhotonGeocoder(), new NominatimGeocoder());
