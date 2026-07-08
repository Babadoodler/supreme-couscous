// Route repository over IndexedDB (DESIGN.md §9). Whole-route writes only —
// routes are small and partial writes aren't worth the complexity.

import type { Route, Stop, StopSource } from '../types';
import type { LatLon } from '../types';
import { getDb } from './db';

export function newId(): string {
  return crypto.randomUUID();
}

export function createStop(pos: LatLon, source: StopSource, name = '', note = ''): Stop {
  return { id: newId(), lat: pos.lat, lon: pos.lon, name, note, source, createdAt: Date.now() };
}

export function createRoute(name = 'Untitled route'): Route {
  const now = Date.now();
  return {
    id: newId(),
    name,
    description: '',
    stops: [],
    loop: false,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1
  };
}

export async function listRoutes(): Promise<Route[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('routes', 'by-updated');
  return all.reverse(); // most recently edited first
}

export async function getRoute(id: string): Promise<Route | undefined> {
  const db = await getDb();
  return db.get('routes', id);
}

/** Upsert, stamping updatedAt (autosave path). */
export async function saveRoute(route: Route): Promise<Route> {
  const db = await getDb();
  const stamped = { ...route, updatedAt: Date.now() };
  await db.put('routes', stamped);
  return stamped;
}

/** Restore a route exactly as it was (snackbar-undo path) — no restamp. */
export async function restoreRoute(route: Route): Promise<void> {
  const db = await getDb();
  await db.put('routes', route);
}

export async function deleteRoute(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('routes', id);
}

export function duplicateRoute(route: Route): Route {
  const now = Date.now();
  return {
    ...route,
    id: newId(),
    name: `${route.name} copy`,
    stops: route.stops.map((s) => ({ ...s, id: newId() })),
    createdAt: now,
    updatedAt: now
  };
}
