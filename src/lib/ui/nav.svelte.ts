// Hash-based navigation: '#/' → library, '#/route/<id>' → editor,
// '#/route/<id>/overview' → overview. Flat IA (DESIGN.md §6); the browser
// back button walks back up.

export interface NavState {
  screen: 'library' | 'editor' | 'overview';
  routeId: string | null;
}

export const nav = $state<NavState>({ screen: 'library', routeId: null });

function applyHash(): void {
  const m = location.hash.match(/^#\/route\/([\w-]+)(\/overview)?$/);
  if (m) {
    nav.screen = m[2] ? 'overview' : 'editor';
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

export function gotoOverview(routeId: string): void {
  location.hash = `#/route/${routeId}/overview`;
}
