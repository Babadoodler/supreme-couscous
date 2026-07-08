import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '../../src/lib/store/db';
import {
  createRoute,
  createStop,
  deleteRoute,
  duplicateRoute,
  getRoute,
  listRoutes,
  restoreRoute,
  saveRoute
} from '../../src/lib/store/routes';
import { getSetting, setSetting } from '../../src/lib/store/settings';

beforeEach(() => {
  // Fresh database per test.
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('route repository', () => {
  it('saves and retrieves a route', async () => {
    const route = createRoute('Test');
    await saveRoute(route);
    const loaded = await getRoute(route.id);
    expect(loaded?.name).toBe('Test');
    expect(loaded?.schemaVersion).toBe(1);
  });

  it('lists routes most recently updated first', async () => {
    const a = await saveRoute(createRoute('A'));
    await new Promise((r) => setTimeout(r, 5));
    await saveRoute(createRoute('B'));
    await new Promise((r) => setTimeout(r, 5));
    await saveRoute({ ...a, description: 'touched' }); // A becomes newest
    const names = (await listRoutes()).map((r) => r.name);
    expect(names).toEqual(['A', 'B']);
  });

  it('stamps updatedAt on save but not on restore', async () => {
    const route = createRoute('Undo me');
    const saved = await saveRoute(route);
    await deleteRoute(saved.id);
    expect(await getRoute(saved.id)).toBeUndefined();
    await restoreRoute(saved);
    const restored = await getRoute(saved.id);
    expect(restored?.updatedAt).toBe(saved.updatedAt);
  });

  it('deletes routes', async () => {
    const route = await saveRoute(createRoute('Gone'));
    await deleteRoute(route.id);
    expect(await listRoutes()).toHaveLength(0);
  });

  it('duplicates with new ids and " copy" suffix', async () => {
    const route = createRoute('Original');
    route.stops = [
      createStop({ lat: -37.8, lon: 144.9 }, 'map', 'One'),
      createStop({ lat: -37.9, lon: 145.0 }, 'coords', 'Two')
    ];
    const copy = duplicateRoute(route);
    expect(copy.id).not.toBe(route.id);
    expect(copy.name).toBe('Original copy');
    expect(copy.stops.map((s) => s.name)).toEqual(['One', 'Two']);
    expect(copy.stops[0]!.id).not.toBe(route.stops[0]!.id);
  });

  it('round-trips stop data through IndexedDB intact', async () => {
    const route = createRoute('Full');
    route.stops = [createStop({ lat: -37.8136, lon: 144.9631 }, 'search', 'Flinders', 'note')];
    route.loop = true;
    await saveRoute(route);
    const loaded = await getRoute(route.id);
    expect(loaded?.stops).toEqual(route.stops);
    expect(loaded?.loop).toBe(true);
  });
});

describe('settings store', () => {
  it('gets and sets values', async () => {
    expect(await getSetting('units')).toBeUndefined();
    await setSetting('units', 'imperial');
    expect(await getSetting('units')).toBe('imperial');
  });
});
