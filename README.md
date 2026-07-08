# WayPoint

A mobile-first PWA for creating, storing, editing, and exporting simple GPX
routes — built for converting Pokémon GO / Niantic in-game routes (and any
other point-to-point walks) into GPX for mapping apps.

**`DESIGN.md` is the authoritative product spec.** `CLAUDE.md` summarises the
standing requirements for AI-assisted development.

## Features

- **Mixed stop input** through one add bar: map tap (with confirm card),
  place/address search (Photon → Nominatim fallback), raw coordinates
  (decimal, DMS, `geo:` URIs, Google/Apple Maps URLs), clipboard detection,
  and single-fix GPS.
- Drag reorder with live map feedback, inline rename, insert-after, reverse,
  loop toggle, 50-step undo/redo, autosave everywhere — no Save button.
- GPX 1.1 export (waypoints + ordered `<rte>` dual output) via share sheet or
  download; tolerant import of GPX 1.0/1.1 waypoint/route/track files with
  optional simplification; whole-library JSON backup.
- Local-first: IndexedDB, no backend, no accounts. Everything except map
  tiles and search works offline. Installable PWA with `.gpx` file handling.

## Development

```sh
npm install
npm run dev       # dev server
npm test          # unit tests (Vitest)
npm run check     # svelte-check / typecheck
npm run build     # production build → dist/
npm run preview   # serve the production build
```

## Deploying to Cloudflare

The app is fully static (`dist/` after `npm run build`), uses hash-based
routing (no redirect rules needed), and `public/_headers` ships the correct
caching rules for the service worker and hashed assets.

### Workers Builds (git-connected Worker)

`wrangler.jsonc` is checked in and serves `dist/` as static assets under the
Worker name `supreme-couscous`. Configure the project with:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

### Classic Pages project

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 22 (set `NODE_VERSION=22` env var) |
