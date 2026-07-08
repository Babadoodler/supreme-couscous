# WayPoint — GPX Route Builder PWA
## Design Document & Build Reference

**Status:** Draft v1.0 · 2026-07-08
**Purpose:** This document is the single source of truth for building the app. It is written to be followed as a manual: each section is specified concretely enough to implement without further product decisions, and §14 sequences the work into buildable layers.

> **Note on the reference GPX:** the hand-written Melbourne example mentioned in the original brief was not available when this document was authored. The output format in §4 is therefore specified against the GPX 1.1 standard (waypoints + ordered route), which is what mapping apps and Pokémon GO route conversion tools consume. If the reference file surfaces later and differs (e.g. it uses `<trk>` instead of `<rte>`, or custom extensions), update §4 first — everything else derives from it.

---

## 1. Problem Statement

People who work with GPX routes on mobile — in particular players converting Pokémon GO / Niantic in-game routes into GPX for mapping apps — are poorly served by existing tools:

- Most tools are desktop-oriented; on a phone they are fiddly or broken.
- Nearly all rely on a single input method: **tap the map to drop a pin**. That works when you know exactly where a stop is, and fails when you only know it by name or address (e.g. a PokéStop named after a mural, a POI you've never visited).
- Tools that support search rarely let you **mix** search-added and map-added stops in one flow.
- Reordering stops, closing a loop, and re-editing a saved route are afterthoughts or missing.

**The product:** a mobile-first PWA that lets a user create, store, modify, and export simple GPX files, with multiple interchangeable ways to add stops and frictionless route management. No elevation, no travel modes, no turn-by-turn — just points in order.

## 2. Goals & Non-Goals

### Goals
1. Create a route from nothing to exported GPX in under a minute for a simple case.
2. Every stop can be added by **any** of: map tap, address/place search, raw coordinates, or clipboard paste — freely mixed within one route.
3. Routes persist on-device; the app is fully usable offline except for geocoding/map-tile fetches.
4. Editing is first-class: reorder, rename, nudge position, insert mid-route, reverse, loop.
5. Export produces clean, standards-compliant GPX 1.1 that imports correctly into common consumers (Organic Maps, OsmAnd, Google Earth, GPX Studio, Garmin).
6. Installable PWA with offline shell; works one-handed on a phone.

### Non-Goals (explicitly out of scope)
- Elevation / slope data.
- Travel-mode metadata or routing along road networks (points are connected by straight lines; the consumer app handles navigation).
- Turn-by-turn navigation inside the app.
- Accounts, sync, sharing backends, or any server-side state.
- Track recording from live GPS movement (a "use my location as a stop" button is in scope; continuous recording is not).

## 3. Target Users & Primary Use Cases

| # | Use case | Flow it must make easy |
|---|----------|------------------------|
| U1 | Convert a Pokémon GO in-game route to GPX | Add stops by POI name/address when map position is unknown; paste coordinates copied from other tools; reorder to match in-game order; export |
| U2 | Plan a walking loop through known places | Map taps for known spots + search for the rest; close the loop with one action |
| U3 | Fix up an existing GPX | Import file; rename/move/delete/reorder points; re-export |
| U4 | Maintain a small library of routes | List, duplicate, rename, delete saved routes; everything survives app restarts offline |

## 4. GPX Output Specification

### 4.1 Format

GPX 1.1, UTF-8, generated with proper XML escaping. Each route exports as one file containing:

- One `<wpt>` element per stop (so consumers that only read waypoints — common for POI-style use — still get everything), **and**
- One `<rte>` with the same points as ordered `<rtept>` elements (so consumers that read routes get the ordering and the connecting line).

This dual representation is deliberate: it maximises compatibility across apps that disagree about which element to honour, at negligible file-size cost. Offer a per-export toggle for "waypoints + route" (default), "route only", and "waypoints only" under an Advanced disclosure in the export sheet.

### 4.2 Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="WayPoint"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Melbourne CBD Loop</name>
    <desc>Optional route description</desc>
    <time>2026-07-08T04:00:00Z</time>
  </metadata>
  <wpt lat="-37.815340" lon="144.966249">
    <name>Flinders Street Station</name>
    <desc>Optional per-stop note</desc>
  </wpt>
  <wpt lat="-37.817979" lon="144.968280">
    <name>Federation Square</name>
  </wpt>
  <!-- ... one wpt per stop ... -->
  <rte>
    <name>Melbourne CBD Loop</name>
    <rtept lat="-37.815340" lon="144.966249"><name>Flinders Street Station</name></rtept>
    <rtept lat="-37.817979" lon="144.968280"><name>Federation Square</name></rtept>
    <!-- ... in stop order; if loop enabled, first point repeated at end ... -->
  </rte>
</gpx>
```

### 4.3 Rules

- Coordinates: decimal degrees, 6 decimal places (~0.1 m precision), period decimal separator regardless of locale.
- Latitude clamped to [-90, 90], longitude normalised to [-180, 180] on input, never at export time (export never silently mutates data).
- `<name>` mandatory on every point at export; unnamed stops export as `Stop 1`, `Stop 2`, … by position.
- **Loop:** when the route's loop flag is on, the export appends a final `<rtept>` duplicating the first point (name suffixed " (return)"). No duplicate `<wpt>` is emitted.
- Filename: slugified route name + `.gpx` (`melbourne-cbd-loop.gpx`); fall back to `route-YYYYMMDD-HHMM.gpx`.
- No `<ele>`, no `<extensions>`, no travel-mode metadata — per non-goals.

### 4.4 Import tolerance

Import must accept real-world messy GPX (see §10): 1.0 or 1.1, `wpt`-only files, `rte`-only files, `trk` files (flatten trkpts into stops, offering to simplify if >200 points), missing names, BOM, unescaped-but-parseable entities. Import never fails silently — either it loads with a summary ("Imported 14 stops from track 'Morning walk'") or it shows a specific error.

## 5. Data Model

All persistence is local (IndexedDB). Schema versioned from day one.

```ts
interface Stop {
  id: string;            // uuid v4
  lat: number;
  lon: number;
  name: string;          // "" allowed in-app; defaulted at export
  note: string;          // maps to <desc>
  source: 'map' | 'search' | 'coords' | 'clipboard' | 'gps' | 'import';
  createdAt: number;     // epoch ms
}

interface Route {
  id: string;            // uuid v4
  name: string;
  description: string;
  stops: Stop[];         // order IS the route order
  loop: boolean;         // export closes back to first stop
  createdAt: number;
  updatedAt: number;
  schemaVersion: 1;
}
```

Notes:
- `stops` array order is the single source of truth for ordering — no separate index field to drift out of sync.
- `source` powers small UX affordances (icon per stop showing how it was added) and debugging; it has no semantic effect.
- Undo/redo (§7.6) operates on immutable snapshots of `Route`; snapshots are session-only, not persisted.

## 6. Information Architecture & Screens

Three screens plus modal sheets. Navigation is flat; no hamburger menus.

```
┌────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  Route Library │ ──▶ │    Route Editor      │ ──▶ │ Export sheet│
│  (home)        │     │  (map + stop list)   │     │ (modal)     │
└────────────────┘     └──────────────────────┘     └─────────────┘
        │                        │
        ▼                        ▼
   Import sheet            Add-stop sheet
   (modal)                 (modal, multi-mode)
```

### 6.1 Route Library (home)

- Card list of saved routes: name, stop count, loop badge, relative last-edited time, thumbnail polyline (static SVG minimap rendered from stop coords — no tile fetch, works offline).
- Primary FAB: **＋ New route** → creates an untitled route and opens the editor immediately (no name-first dialog; naming can happen later — reduce friction before value).
- Per-card overflow menu: Rename · Duplicate · Export · Delete (delete confirms via snackbar with 5 s Undo rather than a blocking dialog).
- Secondary action in the header: **Import GPX** (§10).
- Empty state: one sentence + the two actions (New route / Import).

### 6.2 Route Editor (the core screen)

Split layout, portrait-first:

- **Top ~55%: map.** Numbered circular markers per stop (number = order), polyline connecting them in order, dashed segment back to start when loop is on. Auto-fit bounds on open; never re-fit while the user is interacting.
- **Bottom ~45%: stop list** in a draggable bottom sheet with three detents: peek (just the add bar), half (default), full (map shrinks to a strip). This keeps both map and list one gesture away instead of forcing a mode switch.
- **Persistent add bar** at the top of the sheet: a single text field with placeholder "Search, paste coords, or tap the map" plus a target-icon button (add current GPS location). This one control is the heart of the mixed-input requirement — see §7.1.
- Header: back, route name (tap to rename inline), overflow: Reverse order · Loop on/off · Route details (description) · Duplicate · Delete.
- Footer of the sheet / header action: **Export** button, always visible.
- Autosave on every mutation (debounced 500 ms). There is no Save button anywhere.

### 6.3 Stop list rows

Each row: drag handle · order number · name (tap to rename inline) · source icon · overflow (Edit coords · Add note · Insert stop after · Delete).

- **Reorder:** long-press anywhere on the row (or immediately on the handle) → drag. Auto-scroll near list edges. Map polyline and marker numbers update live during the drag.
- **Swipe left:** delete, with snackbar Undo.
- **Tap row:** map pans/zooms to that stop and the marker pulses; second tap opens the stop's edit sheet.
- Selecting a marker on the map highlights and scrolls to its row (bidirectional linkage).

### 6.4 Empty editor state

Before the first stop: map shows the user's rough location (IP-based or last-used region if geolocation is denied — never block on the permission prompt), and the add bar is auto-focused with a one-line hint under it: "Tap the map or type a place, address, or coordinates."

## 7. Feature Specifications

### 7.1 The unified add bar (mixed input)

One text field, input-type detection on the fly — the user never chooses a mode:

1. **Coordinate detection.** As the user types/pastes, match against coordinate patterns *before* treating input as a search query:
   - `-37.8136, 144.9631` (comma/space/semicolon separated decimals)
   - `-37.8136 144.9631`
   - `37°48'49"S 144°57'47"E` and `37.8136° S, 144.9631° E` (DMS/DDM variants)
   - Google-Maps-style URLs containing `@lat,lon` or `q=lat,lon`
   - `geo:lat,lon` URIs
   When a coordinate parse succeeds, show an inline result card "📍 −37.8136, 144.9631 — Add as stop" above any search results; one tap adds it. If reverse geocoding is available (online), asynchronously fill in a suggested name ("Near Flinders St…") that the user can accept or ignore — the stop is added immediately with the raw coords regardless, and the name backfills if accepted.
2. **Place/address search.** Anything that doesn't parse as coordinates queries the geocoder (§12.3) after a 300 ms debounce, biased to the current map viewport, then globally. Results list shows name, locality line, and distance/direction from map centre. Tapping a result adds the stop **and keeps the sheet open with the field cleared and focused**, so consecutive searched stops chain without re-tapping (critical for the PokéStop-list workflow). A small "added ✓ Stop 7" toast confirms each add.
3. **Clipboard assist.** On editor focus/app resume, if the clipboard is readable and contains something that parses as coordinates, show a dismissible chip above the add bar: "Paste −37.8136, 144.9631 from clipboard?" Never auto-add; never nag (dismissing suppresses that clipboard value for the session). On browsers that gate clipboard reads behind a prompt, only offer the chip after the user has pasted manually once (progressive enhancement, no permission nagging).
4. **Map tap.** Tapping an empty map location drops a **provisional** marker with a small confirm card ("Add stop here · Cancel"), preventing the classic accidental-tap-while-panning error. Confirming adds it (reverse-geocoded name suggestion applied the same way as 1). Long-press adds immediately without confirmation, for power users.
5. **GPS button.** Target icon adds the device's current location as a stop (single fix, no tracking). Errors (denied/unavailable) surface as a toast, never a blocking dialog.

New stops append to the end of the route by default. **Insert elsewhere:** either "Insert stop after" on a row's overflow (arms the add bar in insert mode, shown by a coloured banner "Inserting after Stop 3 — ✕"), or drag the new stop where it belongs afterwards. Both paths exist because insertion-by-position and reorder-after-the-fact suit different users.

### 7.2 Reordering & bulk management

- Drag-and-drop as per §6.3, with live map feedback.
- Overflow → **Reverse route** (one tap, undoable).
- Overflow → **Select mode**: checkboxes per row for bulk delete and "move selected to start/end". Kept minimal deliberately; anything fancier waits for real demand.

### 7.3 Loop

A single toggle on the route (header overflow + a chip next to the stop count). Effects:
- Map draws the dashed closing segment.
- Export behaviour per §4.3.
- If the first and last stops are already within 10 m of each other when the user enables loop, note it ("Route already ends at start — loop will reuse Stop 1") and don't double-close.

### 7.4 Stop editing

Stop edit sheet (from row second-tap or overflow → Edit): name, note, and coordinates shown as editable decimal fields **plus** a "Adjust on map" mode that enters a crosshair drag — the map pans under a fixed centre pin, with the live coordinate readout, Confirm/Cancel. This suits "I know it's slightly north of where I tapped" corrections that are painful with raw numbers.

### 7.5 Route-level editing

Rename inline in header; description in a details sheet; duplicate (copies stops, appends "copy" to name); delete with undo snackbar.

### 7.6 Undo/redo

Session-scoped, per-route, min 50 steps. Every mutation (add/delete/move/reorder/rename/loop-toggle/reverse/import-merge) pushes a snapshot. UI: undo/redo buttons in the editor header on wide screens; on phones, undo surfaces contextually via snackbars for destructive ops plus a two-finger-tap gesture is **not** relied upon — a small undo button sits in the sheet header at all times. Redo lives next to it, hidden until applicable.

### 7.7 Quality-of-life details (all in scope, all cheap)

- Stop count and straight-line total distance shown live in the sheet header (distance is informational; formatted km/mi by locale).
- Auto-numbered default names ("Stop 4") that renumber presentation-only (the number shown is positional; a *custom* name never changes).
- Route name defaults to "Untitled route"; first export prompts (non-blocking, pre-filled) for a real name.
- Keyboard "next" action in the add bar adds the top search result (fast entry of a known list of places).
- All destructive actions are undoable rather than confirm-dialog-guarded, except "Delete route" from the library which gets snackbar-undo too.
- Share-target: exported files use the Web Share API where available so "Export" can go straight into another app on the phone; file download is the fallback.
- The export sheet also offers **View GPX** (scrollable inline preview of the exact output, reflecting the chosen variant) and **Copy** (raw GPX text to the clipboard) — some destinations take pasted text more readily than a file.

### 7.8 Route overview & shareable exports

Each route gets a read-only **Overview** page (from the editor's route menu and the library card menu): a large offline SVG minimap, a design-first stats block (stop count, straight-line distance, an *estimated* walking time at a fixed 12 min/km pace — display-only, clearly labelled an estimate, never written into the GPX), start/end stop names, loop badge, description, and the numbered stop list with coordinates. Below it, the raw GPX text (with copy), which doubles as page 2 of the print layout.

Exports from the overview:
- **Copy as Markdown** — the overview as portable text with a coordinates table.
- **Save image (PNG)** — a canvas-rendered share card (map polyline + stats) via the share sheet or download.
- **Print / Save as PDF** — a print stylesheet renders page 1 = overview, page 2 = raw GPX text; no PDF library needed.

### 7.9 Import from Pokémon GO screenshot

A dedicated import path for the in-game route-info card (screenshot or pasted image). All processing is on-device (tesseract.js in a lazy-loaded worker; OCR code assets bundled or SW-cached — the image never leaves the phone).

Pipeline: OCR → **pure text parser** (`lib/ocr/pogoCard.ts`, unit-tested against real card fixtures) extracting route name, distance/duration, locality line, About text, and the `Start point:` / `End point:` names → preview sheet with editable fields → create route.

Coordinate resolution is best-effort by design — the card contains *names, not coordinates*, and Niantic POIs are frequently absent from OSM:
1. Geocode the locality line to anchor the area.
2. Geocode each start/end name biased to that locality; a confident hit fills real coordinates.
3. A miss still creates the stop, placed at the locality anchor, named from the card, with a note flagging it as approximate — the existing Edit → Adjust-on-map crosshair is the correction path. The UI must say what happened ("Couldn't pin 'X' exactly — placed near The Ponds; adjust on map"), never pretend precision.
4. Fully offline: parse still works; route is created with metadata and any stops the user places manually.

## 8. PWA Requirements

- **Manifest:** name, short_name, icons (192/512 + maskable), `display: standalone`, portrait orientation preferred but not locked, theme colour.
- **Service worker:** precache the app shell (HTML/JS/CSS/fonts/icons); stale-while-revalidate for map tiles with an LRU cap (~50 MB); network-only for geocoding (results are user-initiated and stale results are worse than none). App must load and allow full route editing/export with zero network — only tile imagery and search degrade.
- **Offline UX:** when offline, the add bar disables search with an inline note ("Offline — coordinates and map taps still work"); everything else functions.
- **File handling:** register as a handler for `.gpx` (`file_handlers` in manifest) and as a Web Share Target for files where supported, so "Open with" from other apps lands in the import flow.
- **Storage:** request `navigator.storage.persist()` after the first route is saved (not on first load), so the browser doesn't evict the user's library.
- No install nagging: show a subtle install hint in the library header only after the second session.

## 9. Storage & Persistence

- IndexedDB via the `idb` wrapper. One object store `routes` keyed by `id`, index on `updatedAt`.
- Writes are whole-route (routes are small; partial writes aren't worth the complexity).
- `schemaVersion` field + a migration ladder run at startup.
- A lightweight `settings` store: units, last map viewport, dismissed hints.
- **Panic export:** library overflow → "Export all routes" produces a single JSON backup (and, secondarily, a zip of GPX files if JSZip is included — defer to Layer 6). This is the user's insurance against browser data loss; surface it gently ("Back up your routes") once the library exceeds 3 routes.

## 10. Import

Entry points: library Import button, `.gpx` file-handler launch, share-target, drag-drop on desktop.

Pipeline: parse (DOMParser) → normalise (per §4.4: collect `wpt`, else `rtept`, else flattened `trkpt`; names defaulted; coords validated) → preview sheet showing name, point count, and minimap → user confirms "Import as new route". If a track has >200 points, offer Douglas-Peucker simplification with a live count slider (default ~50 points) since hand-editing 2,000 trackpoints is not this app's job. Multi-`rte`/`trk` files import as multiple routes with a per-item checklist.

## 11. Visual & Interaction Design Principles

- Mobile-first, one-handed: primary actions in the bottom half of the screen; the add bar, export, and sheet controls all thumb-reachable.
- Touch targets ≥ 44 px; drag handles generous.
- Motion: marker pulse on select, sheet spring physics, drag ghosting — subtle, ≤200 ms, `prefers-reduced-motion` respected.
- Light/dark theme following the system, including map tile style swap.
- Copy tone: short, concrete, never blames the user ("Couldn't find that place" not "Invalid query").
- Accessibility: full keyboard operability on desktop; list reordering available via row overflow → "Move up/down" as the non-drag path; ARIA live region announces adds/deletes/reorders; map is enhancement, not requirement — every operation is achievable from the list.

## 12. Technical Architecture

### 12.1 Stack (decided, not options)

| Concern | Choice | Why |
|---|---|---|
| Framework | **Svelte + Vite + TypeScript** | Small bundle (PWA cold-start matters on mobile data), simple state model fits a local-first app |
| Map | **MapLibre GL JS** | Vector tiles = crisp mobile rendering + easy light/dark style swap; no API-key lock-in |
| Tiles | OpenFreeMap (default) with the style URL in one config constant | Free, no key; swappable |
| Geocoding | **Photon (komoot)** primary, Nominatim fallback | Free, no key, good POI coverage, supports viewport bias; both hit the same OSM data |
| Reverse geocoding | Nominatim `/reverse` | Adequate for name suggestions |
| Storage | IndexedDB via `idb` | §9 |
| GPX | Hand-rolled serialiser (~100 lines) + DOMParser-based importer | The format subset is tiny; a dependency adds risk not value |
| Drag & drop | `svelte-dnd-action` (or pointer-events hand-roll if it fights the bottom sheet) | Touch-friendly list DnD |
| Service worker | `vite-plugin-pwa` (Workbox) | Standard, low-maintenance |
| Tests | Vitest (unit) + Playwright (E2E) | §13 |

No backend. No accounts. Geocoding and tiles are the only network dependencies, both third-party and unauthenticated. Respect Nominatim's usage policy (identify via `User-Agent`/`Referer`, debounce, no bulk).

### 12.2 Module layout

```
src/
  lib/
    gpx/            serialize.ts, parse.ts, simplify.ts   ← pure, fully unit-tested
    geo/            coordParse.ts, distance.ts, format.ts ← pure, fully unit-tested
    store/          routes.ts (IndexedDB repo), settings.ts, undo.ts
    search/         geocoder.ts (Photon/Nominatim adapters), clipboard.ts
  components/
    library/        RouteCard, MiniMap, ImportSheet
    editor/         MapView, StopSheet, AddBar, StopRow, StopEditSheet, ExportSheet
  routes (pages):   Library, Editor
```

`lib/gpx` and `lib/geo` must have **zero DOM/framework imports** — they are the correctness core and the most heavily tested code in the app.

### 12.3 Geocoder adapter contract

```ts
interface GeocodeResult { name: string; locality: string; lat: number; lon: number; }
interface Geocoder {
  search(q: string, bias?: {lat: number; lon: number}): Promise<GeocodeResult[]>;
  reverse(lat: number, lon: number): Promise<GeocodeResult | null>;
}
```

Adapters for Photon and Nominatim behind this interface; a failing primary falls through to the fallback; both failing degrades to coordinate-only input with the offline messaging. This seam also allows a future paid geocoder without touching UI code.

## 13. Testing Strategy

- **Unit (Vitest):** coordinate parser (every format in §7.1.1, plus garbage, locale commas, whitespace zoo); GPX serialiser (loop on/off, escaping, naming defaults, precision); GPX parser (fixture files: wpt-only, rte-only, trk, GPX 1.0, BOM, multi-route, broken); simplification; distance.
- **Component:** add-bar mode detection, reorder updates order, undo/redo ladders.
- **E2E (Playwright, mobile viewport):** the four use-cases in §3 end-to-end, including offline mode (route editing + export with network blocked) and import via file input.
- **Round-trip invariant:** `parse(serialize(route))` ≡ route for all generated routes — property-style test.
- Manual compatibility pass before each release: export imported into Organic Maps, OsmAnd, GPX Studio, Google Earth web.

## 14. Build Plan (layered milestones)

Each layer ships a usable increment and is a natural PR boundary.

- **Layer 0 — Scaffold:** Vite + Svelte + TS, PWA plugin, CI (typecheck, lint, unit tests), deploy pipeline to static hosting. App shell installs and loads offline.
- **Layer 1 — Correctness core:** `lib/geo` + `lib/gpx` complete with their full unit-test suites. No UI yet beyond a debug page. *(This first because everything else leans on it, and it's the highest-risk-of-subtle-bugs code.)*
- **Layer 2 — Routes & storage:** data model, IndexedDB repo, library screen (create/rename/duplicate/delete/list), autosave plumbing.
- **Layer 3 — Editor MVP:** map with markers/polyline, stop list with tap-to-focus, map-tap add (with confirm card), coordinate input via add bar, inline rename, delete with undo, export sheet producing §4-compliant GPX. **At the end of Layer 3 the app is genuinely usable for U2/U4.**
- **Layer 4 — Search & mixed input:** geocoder adapters, search-in-add-bar with chaining, reverse-geocode name suggestions, clipboard chip, GPS button, insert-after mode. **Unlocks U1.**
- **Layer 5 — Management polish:** drag reorder with live map, loop toggle + dashed segment, reverse route, stop edit sheet with crosshair adjust, undo/redo history, select mode.
- **Layer 6 — Import & interop:** import pipeline + preview + simplification, file handlers, share target, Web Share export, backup-all. **Unlocks U3.**
- **Layer 7 — Fit & finish:** dark map style, reduced-motion, a11y audit, empty states, install hint, storage persistence prompt, compatibility pass, perf budget check (≤200 KB gz initial JS).
- **Layer 8 — Route overview & exports (§7.8):** overview page, Markdown copy, PNG share card, print/PDF layout.
- **Layer 9 — Pokémon GO screenshot import (§7.9):** OCR wiring, card parser + fixtures, geocode-with-fallback flow.

## 15. Acceptance Criteria (definition of "done" for v1)

1. All four §3 use-cases pass as Playwright E2E on a mobile viewport.
2. A route built from mixed inputs (≥1 each of map-tap, search, pasted coords) exports a GPX that opens correctly in Organic Maps and GPX Studio, with stops in order and names intact.
3. Loop toggle produces a closed route on export and a dashed closing line on the map.
4. Airplane-mode test: open installed app → open saved route → edit → export. All succeed.
5. Kill-and-relaunch test: no data loss after force-closing mid-edit.
6. `parse(serialize(x))` round-trip property test green.
7. Lighthouse PWA installability checks pass; initial JS ≤ 200 KB gzipped.
