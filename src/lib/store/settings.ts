// Small key-value settings store (DESIGN.md §9): units, last map viewport,
// dismissed hints, persistence bookkeeping.

import { getDb } from './db';

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get('settings', key)) as T | undefined;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put('settings', value, key);
}

/**
 * Ask the browser to protect our storage from eviction. Called after the
 * first meaningful save, not on first load (DESIGN.md §8).
 */
export async function ensurePersistentStorage(): Promise<void> {
  const already = await getSetting<boolean>('persistRequested');
  if (already) return;
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
    await setSetting('persistRequested', true);
  } catch {
    // Non-fatal: some browsers reject or don't implement it.
  }
}
