<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { LatLon, Route, Stop, StopSource } from '../lib/types';
  import { createStop, getRoute, restoreRoute } from '../lib/store/routes';
  import { gotoLibrary } from '../lib/ui/nav.svelte';
  import { showSnack } from '../lib/ui/snackbar.svelte';
  import { routeDistanceMeters } from '../lib/geo/distance';
  import { formatDistance, formatLatLon } from '../lib/geo/format';
  import { stopExportName } from '../lib/gpx/serialize';
  import { geocoder } from '../lib/search/geocoder';
  import MapView from '../components/editor/MapView.svelte';
  import AddBar from '../components/editor/AddBar.svelte';
  import StopRow from '../components/editor/StopRow.svelte';
  import ExportSheet from '../components/editor/ExportSheet.svelte';

  let { routeId }: { routeId: string } = $props();

  let route = $state<Route | null>(null);
  let missing = $state(false);
  let pending = $state<LatLon | null>(null); // map-tap awaiting confirmation (§7.1.4)
  let pendingName = $state(''); // async reverse-geocode suggestion for the confirm card
  let focusId = $state<string | null>(null);
  let focusTick = $state(0); // bumps so re-tapping the same row re-pulses
  let mapCenter = $state<LatLon | null>(null); // search bias (§7.1.2)
  let insertAfterIndex = $state<number | null>(null); // insert mode (§7.1)

  function focusStop(id: string) {
    focusId = id;
    focusTick++;
  }

  function setPending(pos: LatLon) {
    pending = pos;
    pendingName = '';
    // Suggest a name while the confirm card is open; the add never waits on it.
    void geocoder.reverse(pos.lat, pos.lon).then((r) => {
      if (r && pending && pending.lat === pos.lat && pending.lon === pos.lon) {
        pendingName = r.name;
      }
    });
  }

  /** Backfill a reverse-geocoded name onto a still-unnamed stop (§7.1.1). */
  function suggestNameFor(stopId: string, pos: LatLon) {
    void geocoder.reverse(pos.lat, pos.lon).then((r) => {
      if (!r || !route) return;
      const stop = route.stops.find((s) => s.id === stopId);
      if (stop && !stop.name.trim()) {
        stop.name = r.name;
        scheduleSave();
      }
    });
  }
  let exporting = $state(false);
  let renamingRoute = $state(false);
  let draftRouteName = $state('');

  $effect(() => {
    void getRoute(routeId).then((r) => {
      if (r) route = r;
      else missing = true;
    });
  });

  // ---- Autosave: every mutation schedules a debounced write (§6.2). ----
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persist(), 500);
  }

  async function persist() {
    if (!route) return;
    route.updatedAt = Date.now();
    await restoreRoute($state.snapshot(route) as Route);
  }

  onDestroy(() => {
    clearTimeout(saveTimer);
    void persist();
  });

  // ---- Mutations ----
  function addStop(pos: LatLon, source: StopSource, name = '') {
    if (!route) return;
    const stop = createStop(pos, source, name);
    let position: number;
    if (insertAfterIndex !== null) {
      position = Math.min(insertAfterIndex + 1, route.stops.length);
      route.stops.splice(position, 0, stop);
      insertAfterIndex = position; // consecutive adds keep chaining in place
    } else {
      route.stops.push(stop);
      position = route.stops.length - 1;
    }
    focusStop(stop.id);
    scheduleSave();
    showSnack(`Added stop ${position + 1}`, { durationMs: 1800 });
    // GPS/clipboard stops arrive unnamed; offer a reverse-geocoded name.
    if (!name && (source === 'gps' || source === 'clipboard')) {
      suggestNameFor(stop.id, pos);
    }
  }

  function moveStop(index: number, delta: -1 | 1) {
    if (!route) return;
    const target = index + delta;
    if (target < 0 || target >= route.stops.length) return;
    const [moved] = route.stops.splice(index, 1);
    route.stops.splice(target, 0, moved!);
    focusStop(moved!.id);
    scheduleSave();
  }

  function renameStop(stop: Stop, name: string) {
    stop.name = name;
    scheduleSave();
  }

  function deleteStop(index: number) {
    if (!route) return;
    const [removed] = route.stops.splice(index, 1);
    scheduleSave();
    if (!removed) return;
    showSnack(`Deleted "${stopExportName(removed, index)}"`, {
      actionLabel: 'Undo',
      onAction: () => {
        route?.stops.splice(index, 0, removed);
        scheduleSave();
      }
    });
  }

  function toggleLoop() {
    if (!route) return;
    route.loop = !route.loop;
    scheduleSave();
  }

  function commitRouteName() {
    renamingRoute = false;
    if (!route) return;
    const name = draftRouteName.trim();
    if (name && name !== route.name) {
      route.name = name;
      scheduleSave();
    }
  }

  let distance = $derived(route ? routeDistanceMeters(route.stops, route.loop) : 0);
</script>

{#if missing}
  <div class="missing">
    <p>This route doesn't exist any more.</p>
    <button onclick={gotoLibrary}>Back to library</button>
  </div>
{:else if route}
  <div class="editor">
    <header>
      <button class="back" onclick={gotoLibrary} aria-label="Back to library">←</button>
      {#if renamingRoute}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="route-name-input"
          bind:value={draftRouteName}
          autofocus
          onblur={commitRouteName}
          onkeydown={(e) => {
            if (e.key === 'Enter') commitRouteName();
            if (e.key === 'Escape') renamingRoute = false;
          }}
        />
      {:else}
        <button
          class="route-name"
          onclick={() => {
            draftRouteName = route!.name;
            renamingRoute = true;
          }}
        >
          {route.name}
        </button>
      {/if}
      <button
        class="loop-chip"
        class:active={route.loop}
        onclick={toggleLoop}
        aria-pressed={route.loop}
      >
        Loop
      </button>
      <button class="export" onclick={() => (exporting = true)} disabled={route.stops.length === 0}>
        Export
      </button>
    </header>

    <div class="map-area">
      <MapView
        stops={route.stops}
        loop={route.loop}
        {pending}
        {focusId}
        {focusTick}
        onmaptap={setPending}
        onviewchange={(c) => (mapCenter = c)}
      />
      {#if pending}
        <div class="confirm-card">
          {#if pendingName}
            <span class="pending-name">{pendingName}</span>
          {/if}
          <span>{formatLatLon(pending)}</span>
          <div class="confirm-actions">
            <button class="cancel" onclick={() => (pending = null)}>Cancel</button>
            <button
              class="confirm"
              onclick={() => {
                addStop(pending!, 'map', pendingName);
                pending = null;
              }}
            >
              Add stop here
            </button>
          </div>
        </div>
      {/if}
    </div>

    <section class="sheet" aria-label="Route stops">
      <div class="sheet-header">
        {#if insertAfterIndex !== null}
          <div class="insert-banner">
            <span>
              Inserting after stop {Math.min(insertAfterIndex + 1, route.stops.length)}
            </span>
            <button onclick={() => (insertAfterIndex = null)} aria-label="Stop inserting">✕</button>
          </div>
        {/if}
        <AddBar onadd={addStop} bias={mapCenter} />
        <p class="stats" aria-live="polite">
          {route.stops.length}
          {route.stops.length === 1 ? 'stop' : 'stops'}
          {#if route.stops.length >= 2}
            · {formatDistance(distance)}{route.loop ? ' loop' : ''}
          {/if}
        </p>
      </div>
      <div class="stops">
        {#if route.stops.length === 0}
          <p class="empty-hint">Tap the map, or type coordinates above, to add your first stop.</p>
        {:else}
          {#each route.stops as stop, i (stop.id)}
            <StopRow
              {stop}
              index={i}
              count={route.stops.length}
              onfocus={() => focusStop(stop.id)}
              onrename={(name) => renameStop(stop, name)}
              ondelete={() => deleteStop(i)}
              oninsertafter={() => (insertAfterIndex = i)}
              onmove={(delta) => moveStop(i, delta)}
            />
          {/each}
        {/if}
      </div>
    </section>
  </div>

  {#if exporting}
    <ExportSheet route={$state.snapshot(route) as Route} onclose={() => (exporting = false)} />
  {/if}
{/if}

<style>
  .editor {
    display: flex;
    flex-direction: column;
    height: 100dvh;
  }

  header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--color-border);
  }

  .back {
    font-size: 1.2rem;
  }

  .route-name {
    flex: 1;
    text-align: left;
    font-weight: 600;
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .route-name-input {
    flex: 1;
    font-weight: 600;
    font-size: 1rem;
    border: 1px solid var(--color-primary);
    border-radius: 6px;
    padding: 8px;
    min-width: 0;
    background: var(--color-bg);
    color: var(--color-text);
  }

  .loop-chip {
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: 0 14px;
    font-size: 0.85rem;
    color: var(--color-text-dim);
    flex-shrink: 0;
  }

  .loop-chip.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-primary-contrast);
    font-weight: 600;
  }

  .export {
    color: var(--color-primary);
    font-weight: 600;
    padding: 0 10px;
    flex-shrink: 0;
  }

  .export:disabled {
    color: var(--color-text-dim);
    opacity: 0.5;
  }

  .map-area {
    position: relative;
    flex: 1 1 52%;
    min-height: 200px;
  }

  .pending-name {
    font-weight: 600;
  }

  .insert-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border-radius: var(--radius);
    padding: 2px 4px 2px 14px;
    margin-bottom: 8px;
    font-size: 0.9rem;
  }

  .insert-banner button {
    color: var(--color-primary-contrast);
  }

  .confirm-card {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    background: var(--color-bg);
    border-radius: var(--radius);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 10;
    font-size: 0.9rem;
  }

  .confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .confirm {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border-radius: 999px;
    padding: 0 18px;
    font-weight: 600;
  }

  .cancel {
    color: var(--color-text-dim);
    padding: 0 10px;
  }

  .sheet {
    flex: 1 1 48%;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border-top: 1px solid var(--color-border);
    border-radius: var(--radius) var(--radius) 0 0;
    margin-top: -12px;
    z-index: 5;
    box-shadow: var(--shadow-sheet);
    min-height: 0;
  }

  .sheet-header {
    padding: 12px 16px 6px;
  }

  .stats {
    margin: 8px 0 0;
    font-size: 0.85rem;
    color: var(--color-text-dim);
  }

  .stops {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px calc(16px + var(--safe-bottom));
  }

  .empty-hint {
    color: var(--color-text-dim);
    text-align: center;
    margin-top: 24px;
  }

  .missing {
    padding: 32px 16px;
    text-align: center;
    color: var(--color-text-dim);
  }
</style>
