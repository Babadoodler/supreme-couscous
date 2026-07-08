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
  import { History } from '../lib/store/history';
  import StopEditSheet from '../components/editor/StopEditSheet.svelte';
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
  let editingStopId = $state<string | null>(null); // stop edit sheet (§7.4)
  let adjustingStopId = $state<string | null>(null); // crosshair adjust mode
  let liveCenter = $state<LatLon | null>(null); // crosshair readout
  let routeMenuOpen = $state(false);
  let editingDescription = $state(false);
  let mapView: { getCenter(): LatLon | null; easeToPos(pos: LatLon, zoom?: number): void } | undefined =
    $state();

  // ---- Undo/redo (§7.6): snapshot pushed before every mutation ----
  const history = new History<Route>(50);
  let canUndo = $state(false);
  let canRedo = $state(false);

  function pushHistory() {
    if (!route) return;
    history.push($state.snapshot(route) as Route);
    canUndo = history.canUndo;
    canRedo = history.canRedo;
  }

  function undo() {
    if (!route) return;
    const prev = history.undo($state.snapshot(route) as Route);
    if (prev) {
      route = prev;
      scheduleSave();
    }
    canUndo = history.canUndo;
    canRedo = history.canRedo;
  }

  function redo() {
    if (!route) return;
    const next = history.redo($state.snapshot(route) as Route);
    if (next) {
      route = next;
      scheduleSave();
    }
    canUndo = history.canUndo;
    canRedo = history.canRedo;
  }

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
    pushHistory();
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
    pushHistory();
    const [moved] = route.stops.splice(index, 1);
    route.stops.splice(target, 0, moved!);
    focusStop(moved!.id);
    scheduleSave();
  }

  function renameStop(stop: Stop, name: string) {
    pushHistory();
    stop.name = name;
    scheduleSave();
  }

  function deleteStop(index: number) {
    if (!route) return;
    pushHistory();
    const [removed] = route.stops.splice(index, 1);
    scheduleSave();
    if (!removed) return;
    showSnack(`Deleted "${stopExportName(removed, index)}"`, {
      actionLabel: 'Undo',
      onAction: () => {
        if (!route) return;
        pushHistory();
        route.stops.splice(Math.min(index, route.stops.length), 0, removed);
        scheduleSave();
      }
    });
  }

  function toggleLoop() {
    if (!route) return;
    pushHistory();
    route.loop = !route.loop;
    scheduleSave();
  }

  function reverseRoute() {
    if (!route || route.stops.length < 2) return;
    pushHistory();
    route.stops.reverse();
    scheduleSave();
    showSnack('Route reversed', { actionLabel: 'Undo', onAction: undo });
  }

  function commitRouteName() {
    renamingRoute = false;
    if (!route) return;
    const name = draftRouteName.trim();
    if (name && name !== route.name) {
      pushHistory();
      route.name = name;
      scheduleSave();
    }
  }

  function saveStopEdits(stop: Stop, changes: { name: string; note: string; lat: number; lon: number }) {
    pushHistory();
    stop.name = changes.name;
    stop.note = changes.note;
    stop.lat = changes.lat;
    stop.lon = changes.lon;
    scheduleSave();
  }

  // ---- Crosshair adjust (§7.4): map pans under a fixed centre pin ----
  function startAdjust(stop: Stop) {
    editingStopId = null;
    adjustingStopId = stop.id;
    liveCenter = { lat: stop.lat, lon: stop.lon };
    mapView?.easeToPos({ lat: stop.lat, lon: stop.lon });
  }

  function confirmAdjust() {
    if (!route || !adjustingStopId) return;
    const stop = route.stops.find((s) => s.id === adjustingStopId);
    const center = mapView?.getCenter();
    if (stop && center) {
      pushHistory();
      stop.lat = center.lat;
      stop.lon = center.lon;
      scheduleSave();
    }
    adjustingStopId = null;
  }

  // ---- Drag reorder (§6.3): live array reorder, one history step per drag ----
  let dragging = $state<{ index: number; startY: number; rowH: number } | null>(null);

  function startDrag(e: PointerEvent, index: number) {
    if (!route) return;
    e.preventDefault();
    pushHistory();
    const row = (e.target as HTMLElement).closest('[data-stop-row]');
    dragging = { index, startY: e.clientY, rowH: (row as HTMLElement | null)?.offsetHeight ?? 56 };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag, { once: true });
    window.addEventListener('pointercancel', endDrag, { once: true });
  }

  function onDragMove(e: PointerEvent) {
    if (!dragging || !route) return;
    let delta = e.clientY - dragging.startY;
    while (Math.abs(delta) > dragging.rowH * 0.6) {
      const dir = delta > 0 ? 1 : -1;
      const to = dragging.index + dir;
      if (to < 0 || to >= route.stops.length) break;
      const [m] = route.stops.splice(dragging.index, 1);
      route.stops.splice(to, 0, m!);
      dragging.index = to;
      dragging.startY += dir * dragging.rowH;
      delta = e.clientY - dragging.startY;
    }
  }

  function endDrag() {
    window.removeEventListener('pointermove', onDragMove);
    if (dragging) {
      dragging = null;
      scheduleSave();
    }
  }

  function saveDescription(text: string) {
    if (!route || text === route.description) return;
    pushHistory();
    route.description = text;
    scheduleSave();
  }

  let distance = $derived(route ? routeDistanceMeters(route.stops, route.loop) : 0);
</script>

<svelte:window onclick={() => (routeMenuOpen = false)} />

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
      <div class="menu-anchor">
        <button
          class="route-menu-btn"
          aria-label="Route actions"
          aria-expanded={routeMenuOpen}
          onclick={(e) => {
            e.stopPropagation();
            routeMenuOpen = !routeMenuOpen;
          }}
        >
          ⋮
        </button>
        {#if routeMenuOpen}
          <div class="menu" role="menu">
            <button
              role="menuitem"
              disabled={route.stops.length < 2}
              onclick={() => {
                routeMenuOpen = false;
                reverseRoute();
              }}
            >
              Reverse order
            </button>
            <button
              role="menuitem"
              onclick={() => {
                routeMenuOpen = false;
                editingDescription = true;
              }}
            >
              Route description
            </button>
          </div>
        {/if}
      </div>
    </header>

    <div class="map-area">
      <MapView
        bind:this={mapView}
        stops={route.stops}
        loop={route.loop}
        pending={adjustingStopId ? null : pending}
        {focusId}
        {focusTick}
        onmaptap={(pos) => {
          if (!adjustingStopId) setPending(pos);
        }}
        onviewchange={(c) => (mapCenter = c)}
        onlivecenter={(c) => (liveCenter = c)}
      />
      {#if adjustingStopId}
        <div class="crosshair" aria-hidden="true">🎯</div>
        <div class="confirm-card adjust-card">
          <span class="pending-name">Move stop here</span>
          {#if liveCenter}<span>{formatLatLon(liveCenter)}</span>{/if}
          <div class="confirm-actions">
            <button class="cancel" onclick={() => (adjustingStopId = null)}>Cancel</button>
            <button class="confirm" onclick={confirmAdjust}>Confirm</button>
          </div>
        </div>
      {:else if pending}
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
        <div class="stats-row">
          <p class="stats" aria-live="polite">
            {route.stops.length}
            {route.stops.length === 1 ? 'stop' : 'stops'}
            {#if route.stops.length >= 2}
              · {formatDistance(distance)}{route.loop ? ' loop' : ''}
            {/if}
          </p>
          <div class="undo-redo">
            <button onclick={undo} disabled={!canUndo} aria-label="Undo">↶</button>
            {#if canRedo}
              <button onclick={redo} aria-label="Redo">↷</button>
            {/if}
          </div>
        </div>
      </div>
      <div class="stops">
        {#if route.stops.length === 0}
          <p class="empty-hint">Tap the map, or type coordinates above, to add your first stop.</p>
        {:else}
          {#each route.stops as stop, i (stop.id)}
            <div data-stop-row class:dragging={dragging?.index === i}>
              <StopRow
                {stop}
                index={i}
                count={route.stops.length}
                onfocus={() => focusStop(stop.id)}
                onrename={(name) => renameStop(stop, name)}
                ondelete={() => deleteStop(i)}
                oninsertafter={() => (insertAfterIndex = i)}
                onmove={(delta) => moveStop(i, delta)}
                onedit={() => (editingStopId = stop.id)}
                ondragstart={(e) => startDrag(e, i)}
              />
            </div>
          {/each}
        {/if}
      </div>
    </section>
  </div>

  {#if exporting}
    <ExportSheet route={$state.snapshot(route) as Route} onclose={() => (exporting = false)} />
  {/if}

  {#if editingStopId}
    {@const editStop = route.stops.find((s) => s.id === editingStopId)}
    {#if editStop}
      <StopEditSheet
        stop={editStop}
        index={route.stops.indexOf(editStop)}
        onsave={(changes) => saveStopEdits(editStop, changes)}
        onadjust={() => startAdjust(editStop)}
        onclose={() => (editingStopId = null)}
      />
    {/if}
  {/if}

  {#if editingDescription}
    <div
      class="scrim"
      onclick={() => (editingDescription = false)}
      onkeydown={(e) => e.key === 'Escape' && (editingDescription = false)}
      role="presentation"
    ></div>
    <div class="desc-sheet" role="dialog" aria-label="Route description">
      <h2>Route description</h2>
      <textarea
        rows="3"
        placeholder="Optional description (exports as route metadata)"
        value={route.description}
        onchange={(e) => saveDescription(e.currentTarget.value)}
      ></textarea>
      <button class="desc-done" onclick={() => (editingDescription = false)}>Done</button>
    </div>
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

  .menu-anchor {
    position: relative;
    flex-shrink: 0;
  }

  .route-menu-btn {
    color: var(--color-text-dim);
    font-size: 1.2rem;
  }

  .menu {
    position: absolute;
    top: 44px;
    right: 0;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    min-width: 180px;
    z-index: 40;
    overflow: hidden;
  }

  .menu button {
    text-align: left;
    padding: 12px 16px;
  }

  .menu button:disabled {
    color: var(--color-text-dim);
    opacity: 0.5;
  }

  .menu button:not(:disabled):hover {
    background: var(--color-surface);
  }

  .stats-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .undo-redo {
    display: flex;
  }

  .undo-redo button {
    font-size: 1.15rem;
    color: var(--color-primary);
  }

  .undo-redo button:disabled {
    color: var(--color-text-dim);
    opacity: 0.4;
  }

  .crosshair {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 2rem;
    pointer-events: none;
    z-index: 9;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }

  [data-stop-row].dragging {
    opacity: 0.6;
    background: var(--color-surface);
  }

  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 100;
  }

  .desc-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--color-bg);
    border-radius: var(--radius) var(--radius) 0 0;
    padding: 20px 20px calc(20px + var(--safe-bottom));
    z-index: 101;
    box-shadow: var(--shadow-sheet);
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .desc-sheet h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .desc-sheet textarea {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--color-surface);
    color: var(--color-text);
    resize: vertical;
  }

  .desc-done {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border-radius: 999px;
    font-weight: 600;
  }
</style>
