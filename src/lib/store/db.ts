// IndexedDB setup (DESIGN.md §9): one 'routes' store keyed by id with an
// updatedAt index, plus a small 'settings' key-value store.
// Any schema change bumps DB_VERSION and adds a migration step below.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Route } from '../types';

export interface WayPointSchema extends DBSchema {
  routes: {
    key: string;
    value: Route;
    indexes: { 'by-updated': number };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'waypoint';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<WayPointSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<WayPointSchema>> {
  dbPromise ??= openDB<WayPointSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const routes = db.createObjectStore('routes', { keyPath: 'id' });
        routes.createIndex('by-updated', 'updatedAt');
        db.createObjectStore('settings');
      }
      // Future migrations: if (oldVersion < 2) { ... }
    }
  });
  return dbPromise;
}

/** Test hook: forget the cached connection so a fresh DB can be opened. */
export function resetDbForTests(): void {
  dbPromise = null;
}
