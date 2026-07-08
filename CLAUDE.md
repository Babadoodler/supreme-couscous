# CLAUDE.md

## Project

**WayPoint** — a mobile-first PWA for creating, storing, modifying, and exporting simple GPX route files (primary audience: converting Pokémon GO / Niantic in-game routes to GPX for mapping apps).

**`DESIGN.md` is the authoritative spec.** Read it before implementing anything; if a requirement here seems ambiguous, the design doc wins. If a product decision must change, update `DESIGN.md` first, then the code.

## Core requirements (summary of DESIGN.md)

- **Mixed stop input is the defining feature:** every stop can be added via map tap (with confirm card against accidental taps), place/address search, raw coordinates (decimal, DMS, geo: URIs, Maps URLs), clipboard paste detection, or single GPS fix — freely mixed in one route through one unified add bar that auto-detects input type (§7.1).
- **Simple GPX only:** GPX 1.1, waypoints + ordered `<rte>` dual output (§4). **No elevation, no slopes, no travel modes, no road routing** — these are explicit non-goals; do not add them.
- **Route management:** drag reorder with live map feedback, inline rename, insert-after, reverse, loop toggle (export closes back to start), duplicate, delete-with-undo, session undo/redo ≥50 steps.
- **Local-first:** IndexedDB storage, no backend, no accounts. Full editing and export must work offline; only geocoding and map tiles may require network.
- **PWA:** installable, offline app shell, `.gpx` file handler + share target, `storage.persist()` after first save.
- **Import tolerance:** accept GPX 1.0/1.1, wpt-only, rte-only, and trk files (flatten + offer simplification >200 pts); never fail silently (§10).
- **Mobile-first UX:** one-handed, bottom-sheet editor, thumb-reachable primary actions, ≥44 px touch targets, autosave everywhere — there is no Save button. All destructive actions get snackbar-undo, not confirm dialogs (except as specified).
- **Accessibility:** every operation achievable from the stop list without the map; non-drag reorder path (Move up/down); reduced-motion respected.

## Stack (decided — see DESIGN.md §12, don't re-litigate)

Svelte + Vite + TypeScript · MapLibre GL JS + OpenFreeMap tiles · Photon geocoding with Nominatim fallback (behind the `Geocoder` adapter interface) · IndexedDB via `idb` · hand-rolled GPX serialiser/parser · `vite-plugin-pwa` · Vitest + Playwright.

## Architecture rules

- `src/lib/gpx/`, `src/lib/geo/`, and `src/lib/ocr/pogoCard.ts` are pure TypeScript: **zero DOM or framework imports.** They are the correctness core and must stay fully unit-tested (the OCR card parser against real degraded OCR fixtures).
- `Route.stops` array order is the single source of truth for stop order — never add a parallel index field.
- Geocoders only via the `Geocoder` adapter interface (§12.3); UI code never calls Photon/Nominatim directly.
- Persisted data carries `schemaVersion`; any schema change adds a migration step.
- Export never mutates stored data (e.g. coordinate normalisation happens on input, not export).

## Testing expectations

- New logic in `lib/gpx` / `lib/geo` lands with unit tests (coordinate-format zoo, GPX fixtures, escaping, loop behaviour).
- Keep the round-trip invariant test green: `parse(serialize(route))` ≡ route.
- E2E (Playwright, mobile viewport) covers the four use-cases in DESIGN.md §3, including an offline scenario.
- Perf budget: initial JS ≤ 200 KB gzipped.

## Build sequence

Follow the layered milestones in DESIGN.md §14 (Layer 0 scaffold → Layer 7 polish). Each layer is a PR-sized increment; don't pull features from later layers into earlier ones without need.
