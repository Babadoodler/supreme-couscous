// Shared import request state. Set from the library's Import button, the
// PWA .gpx file handler (launchQueue), or desktop drag-drop; the App-level
// ImportSheet consumes it (DESIGN.md §10).

export interface ImportRequest {
  fileName: string;
  text: string;
}

export const importState = $state<{ pending: ImportRequest | null }>({ pending: null });

/** Bumped after a successful import so the library re-queries IndexedDB. */
export const libraryVersion = $state({ n: 0 });

export function requestImport(fileName: string, text: string): void {
  importState.pending = { fileName, text };
}

export function clearImport(): void {
  importState.pending = null;
}

export function notifyLibraryChanged(): void {
  libraryVersion.n++;
}
