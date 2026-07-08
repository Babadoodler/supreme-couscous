// Hash-based navigation: '#/' → library, '#/route/<id>' → editor.
// Flat IA (DESIGN.md §6); the browser back button leaves the editor.

export interface NavState {
  screen: 'library' | 'editor';
  routeId: string | null;
}

export const nav = $state<NavState>({ screen: 'library', routeId: null });

function applyHash(): void {
  const m = location.hash.match(/^#\/route\/([\w-]+)$/);
  if (m) {
    nav.screen = 'editor';
    nav.routeId = m[1]!;
  } else {
    nav.screen = 'library';
    nav.routeId = null;
  }
}

if (typeof window !== 'undefined') {
  applyHash();
  window.addEventListener('hashchange', applyHash);
}

export function gotoLibrary(): void {
  location.hash = '#/';
}

export function gotoEditor(routeId: string): void {
  location.hash = `#/route/${routeId}`;
}
