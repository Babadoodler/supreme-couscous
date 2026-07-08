<script lang="ts">
  import type { Route } from '../lib/types';
  import {
    createRoute,
    deleteRoute,
    duplicateRoute,
    listRoutes,
    restoreRoute,
    saveRoute
  } from '../lib/store/routes';
  import { ensurePersistentStorage } from '../lib/store/settings';
  import { gotoEditor } from '../lib/ui/nav.svelte';
  import { showSnack } from '../lib/ui/snackbar.svelte';
  import { serializeGpx } from '../lib/gpx/serialize';
  import { slugifyFilename } from '../lib/geo/format';
  import { downloadFile, shareOrDownloadFile } from '../lib/ui/download';
  import { libraryVersion, requestImport } from '../lib/ui/importState.svelte';
  import RouteCard from '../components/library/RouteCard.svelte';

  let routes = $state<Route[]>([]);
  let loaded = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let headerMenuOpen = $state(false);

  async function refresh() {
    routes = await listRoutes();
    loaded = true;
  }

  $effect(() => {
    void libraryVersion.n; // re-query after imports
    void refresh();
  });

  async function onPickFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file
    if (!file) return;
    requestImport(file.name, await file.text());
  }

  /** Panic export (DESIGN.md §9): one JSON backup of the whole library. */
  function backupAll() {
    const backup = {
      app: 'waypoint',
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      routes
    };
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`waypoint-backup-${date}.json`, JSON.stringify(backup, null, 2), 'application/json');
    showSnack('Backup downloaded');
  }

  async function onNewRoute() {
    const route = createRoute();
    await saveRoute(route);
    await ensurePersistentStorage();
    gotoEditor(route.id);
  }

  async function onRename(route: Route, name: string) {
    await saveRoute({ ...route, name });
    await refresh();
  }

  async function onDuplicate(route: Route) {
    const copy = duplicateRoute(route);
    await saveRoute(copy);
    await refresh();
    showSnack(`Duplicated as "${copy.name}"`);
  }

  async function onExport(route: Route) {
    await shareOrDownloadFile(slugifyFilename(route.name), serializeGpx(route));
  }

  async function onDelete(route: Route) {
    await deleteRoute(route.id);
    await refresh();
    showSnack(`Deleted "${route.name}"`, {
      actionLabel: 'Undo',
      onAction: () => {
        void restoreRoute(route).then(refresh);
      }
    });
  }
</script>

<svelte:window onclick={() => (headerMenuOpen = false)} />

<div class="library">
  <header>
    <h1>WayPoint</h1>
    <div class="header-actions">
      <button class="import-btn" onclick={() => fileInput?.click()}>Import GPX</button>
      {#if routes.length > 0}
        <div class="menu-anchor">
          <button
            class="header-menu-btn"
            aria-label="Library actions"
            aria-expanded={headerMenuOpen}
            onclick={(e) => {
              e.stopPropagation();
              headerMenuOpen = !headerMenuOpen;
            }}
          >
            ⋮
          </button>
          {#if headerMenuOpen}
            <div class="menu" role="menu">
              <button role="menuitem" onclick={() => { headerMenuOpen = false; backupAll(); }}>
                Back up all routes
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </header>
  <input
    type="file"
    accept=".gpx,application/gpx+xml,text/xml,application/xml"
    hidden
    bind:this={fileInput}
    onchange={onPickFile}
  />

  {#if loaded && routes.length === 0}
    <div class="empty">
      <p>Build GPX routes from map taps, place search, or pasted coordinates — all mixed together.</p>
      <button class="primary" onclick={onNewRoute}>＋ New route</button>
      <button class="secondary" onclick={() => fileInput?.click()}>Import a GPX file</button>
    </div>
  {:else}
    <ul class="cards">
      {#each routes as route (route.id)}
        <li>
          <RouteCard
            {route}
            onopen={() => gotoEditor(route.id)}
            onrename={(name) => onRename(route, name)}
            onduplicate={() => onDuplicate(route)}
            onexport={() => onExport(route)}
            ondelete={() => onDelete(route)}
          />
        </li>
      {/each}
    </ul>
    <button class="fab" onclick={onNewRoute} aria-label="New route">＋</button>
  {/if}
</div>

<style>
  .library {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 16px calc(96px + var(--safe-bottom));
    min-height: 100%;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0 8px;
  }

  h1 {
    font-size: 1.3rem;
    margin: 0;
    color: var(--color-primary);
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .empty {
    text-align: center;
    margin-top: 30vh;
    color: var(--color-text-dim);
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border-radius: 999px;
    padding: 0 24px;
    font-weight: 600;
  }

  .secondary {
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: 0 24px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .import-btn {
    color: var(--color-primary);
    font-weight: 600;
    padding: 0 10px;
  }

  .header-menu-btn {
    color: var(--color-text-dim);
    font-size: 1.2rem;
  }

  .menu-anchor {
    position: relative;
  }

  .menu {
    position: absolute;
    top: 44px;
    right: 0;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    min-width: 180px;
    z-index: 60;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .menu button {
    text-align: left;
    padding: 12px 16px;
  }

  .menu button:hover {
    background: var(--color-surface);
  }

  .fab {
    position: fixed;
    right: 20px;
    bottom: calc(24px + var(--safe-bottom));
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    font-size: 1.6rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    z-index: 50;
  }
</style>
