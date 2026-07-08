import { describe, expect, it } from 'vitest';
import {
  FallbackGeocoder,
  NominatimGeocoder,
  PhotonGeocoder,
  type GeocodeResult,
  type Geocoder
} from '../../src/lib/search/geocoder';

function fakeFetch(handler: (url: URL) => unknown) {
  const calls: URL[] = [];
  const fn = async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const body = handler(url);
    if (body instanceof Error) throw body;
    if (typeof body === 'number') return new Response('fail', { status: body });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { fn, calls };
}

const PHOTON_RESPONSE = {
  features: [
    {
      geometry: { coordinates: [144.9663, -37.8183] },
      properties: {
        name: 'Flinders Street Station',
        city: 'Melbourne',
        state: 'Victoria',
        country: 'Australia'
      }
    },
    {
      geometry: { coordinates: [144.97, -37.81] },
      properties: { housenumber: '12', street: 'Swanston St', city: 'Melbourne', country: 'Australia' }
    },
    { geometry: {}, properties: { name: 'broken, no coords' } }
  ]
};

describe('PhotonGeocoder', () => {
  it('maps features to results and skips broken ones', async () => {
    const { fn, calls } = fakeFetch(() => PHOTON_RESPONSE);
    const results = await new PhotonGeocoder(fn).search('flinders');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      name: 'Flinders Street Station',
      locality: 'Melbourne, Victoria, Australia',
      lat: -37.8183,
      lon: 144.9663
    });
    expect(results[1]!.name).toBe('12 Swanston St');
    expect(calls[0]!.searchParams.get('q')).toBe('flinders');
  });

  it('passes viewport bias as lat/lon', async () => {
    const { fn, calls } = fakeFetch(() => ({ features: [] }));
    await new PhotonGeocoder(fn).search('cafe', { lat: -37.8136, lon: 144.9631 });
    expect(calls[0]!.searchParams.get('lat')).toBe('-37.8136');
    expect(calls[0]!.searchParams.get('lon')).toBe('144.9631');
  });

  it('throws on HTTP errors', async () => {
    const { fn } = fakeFetch(() => 503);
    await expect(new PhotonGeocoder(fn).search('x')).rejects.toThrow('503');
  });

  it('reverse returns the first feature or null', async () => {
    const { fn } = fakeFetch(() => PHOTON_RESPONSE);
    const r = await new PhotonGeocoder(fn).reverse(-37.8183, 144.9663);
    expect(r?.name).toBe('Flinders Street Station');
    const { fn: empty } = fakeFetch(() => ({ features: [] }));
    expect(await new PhotonGeocoder(empty).reverse(0, 0)).toBeNull();
  });
});

describe('NominatimGeocoder', () => {
  const ITEM = {
    lat: '-37.8182711',
    lon: '144.9670618',
    name: 'Flinders Street Station',
    display_name: 'Flinders Street Station, Flinders Street, Melbourne, Victoria, Australia'
  };

  it('maps jsonv2 items', async () => {
    const { fn, calls } = fakeFetch(() => [ITEM]);
    const results = await new NominatimGeocoder(fn).search('flinders');
    expect(results[0]!.name).toBe('Flinders Street Station');
    expect(results[0]!.locality).toBe('Flinders Street, Melbourne, Victoria');
    expect(results[0]!.lat).toBeCloseTo(-37.81827, 4);
    expect(calls[0]!.searchParams.get('format')).toBe('jsonv2');
  });

  it('sends an unbounded viewbox for bias', async () => {
    const { fn, calls } = fakeFetch(() => []);
    await new NominatimGeocoder(fn).search('cafe', { lat: -37.8, lon: 144.9 });
    expect(calls[0]!.searchParams.get('viewbox')).toBeTruthy();
    expect(calls[0]!.searchParams.get('bounded')).toBeNull();
  });

  it('reverse maps a single item and handles the error shape', async () => {
    const { fn } = fakeFetch(() => ITEM);
    expect((await new NominatimGeocoder(fn).reverse(-37.8, 144.9))?.name).toBe(
      'Flinders Street Station'
    );
    const { fn: err } = fakeFetch(() => ({ error: 'Unable to geocode' }));
    expect(await new NominatimGeocoder(err).reverse(0, 0)).toBeNull();
  });
});

describe('FallbackGeocoder', () => {
  const ok: Geocoder = {
    search: async () => [{ name: 'B', locality: '', lat: 1, lon: 2 } satisfies GeocodeResult],
    reverse: async () => ({ name: 'B', locality: '', lat: 1, lon: 2 })
  };
  const boom: Geocoder = {
    search: async () => {
      throw new Error('down');
    },
    reverse: async () => {
      throw new Error('down');
    }
  };

  it('uses the primary when healthy', async () => {
    const primary: Geocoder = {
      search: async () => [{ name: 'A', locality: '', lat: 0, lon: 0 }],
      reverse: async () => null
    };
    expect((await new FallbackGeocoder(primary, ok).search('q'))[0]!.name).toBe('A');
  });

  it('falls through to the secondary when the primary throws', async () => {
    expect((await new FallbackGeocoder(boom, ok).search('q'))[0]!.name).toBe('B');
    expect((await new FallbackGeocoder(boom, ok).reverse(0, 0))?.name).toBe('B');
  });

  it('reverse never throws even when both fail', async () => {
    expect(await new FallbackGeocoder(boom, boom).reverse(0, 0)).toBeNull();
  });

  it('propagates search failure when both fail', async () => {
    await expect(new FallbackGeocoder(boom, boom).search('q')).rejects.toThrow();
  });
});
