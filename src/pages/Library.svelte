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
  import { shareOrDownloadFile } from '../lib/ui/download';
  import RouteCard from '../components/library/RouteCard.svelte';

  let routes = $state<Route[]>([]);
  let loaded = $state(false);

  async function refresh() {
    routes = await listRoutes();
    loaded = true;
  }

  $effect(() => {
    void refresh();
  });

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

<div class="library">
  <header>
    <h1>WayPoint</h1>
  </header>

  {#if loaded && routes.length === 0}
    <div class="empty">
      <p>Build GPX routes from map taps, place search, or pasted coordinates — all mixed together.</p>
      <button class="primary" onclick={onNewRoute}>＋ New route</button>
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
