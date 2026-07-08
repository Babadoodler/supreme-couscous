<script lang="ts">
  // Route overview: read-only "route sheet" (DESIGN.md §7.8).
  // On screen: stats + map + stops + GPX. In print: page 1 overview,
  // page 2 raw GPX — the browser's Save-as-PDF is the PDF export.
  import type { Route } from '../lib/types';
  import { getRoute } from '../lib/store/routes';
  import { gotoEditor, gotoLibrary } from '../lib/ui/nav.svelte';
  import { showSnack } from '../lib/ui/snackbar.svelte';
  import { routeDistanceMeters } from '../lib/geo/distance';
  import { formatDistance, formatLatLon, slugifyFilename } from '../lib/geo/format';
  import { serializeGpx, stopExportName } from '../lib/gpx/serialize';
  import { buildMarkdown, estimateWalkMinutes } from '../lib/overview';
  import { renderShareCard } from '../lib/ui/shareCard';
  import { shareOrDownloadFile } from '../lib/ui/download';
  import MiniMap from '../components/library/MiniMap.svelte';

  let { routeId }: { routeId: string } = $props();

  let route = $state<Route | null>(null);
  let missing = $state(false);
  let renderingPng = $state(false);

  $effect(() => {
    void getRoute(routeId).then((r) => {
      if (r) route = r;
      else missing = true;
    });
  });

  let distance = $derived(route ? routeDistanceMeters(route.stops, route.loop) : 0);
  let gpxText = $derived(route ? serializeGpx(route) : '');

  async function copyMarkdown() {
    if (!route) return;
    try {
      await navigator.clipboard.writeText(buildMarkdown(route));
      showSnack('Overview copied as Markdown');
    } catch {
      showSnack("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  async function saveImage() {
    if (!route || renderingPng) return;
    renderingPng = true;
    try {
      const blob = await renderShareCard(route);
      await shareOrDownloadFile(slugifyFilename(route.name).replace(/\.gpx$/, '.png'), blob, 'image/png');
    } catch {
      showSnack("Couldn't render the image on this device.");
    } finally {
      renderingPng = false;
    }
  }

  async function copyGpx() {
    try {
      await navigator.clipboard.writeText(gpxText);
      showSnack('GPX copied to clipboard');
    } catch {
      showSnack("Couldn't copy — your browser blocked clipboard access.");
    }
  }
</script>

{#if missing}
  <div class="missing">
    <p>This route doesn't exist any more.</p>
    <button onclick={gotoLibrary}>Back to library</button>
  </div>
{:else if route}
  <div class="overview">
    <header class="no-print">
      <button class="back" onclick={() => gotoEditor(routeId)} aria-label="Back to editor">←</button>
      <h1>Route overview</h1>
    </header>

    <article class="sheet-page">
      <h2 class="route-name">{route.name}</h2>
      {#if route.description.trim()}
        <p class="description">{route.description}</p>
      {/if}

      <div class="map-wrap">
        <MiniMap stops={route.stops} loop={route.loop} width={360} height={240} pad={20} />
      </div>

      <dl class="stats">
        <div>
          <dt>Stops</dt>
          <dd>{route.stops.length}</dd>
        </div>
        {#if route.stops.length >= 2}
          <div>
            <dt>Distance</dt>
            <dd>{formatDistance(distance)}<span class="fine">straight-line</span></dd>
          </div>
          <div>
            <dt>Walk time</dt>
            <dd>~{estimateWalkMinutes(distance)} min<span class="fine">estimate</span></dd>
          </div>
        {/if}
        <div>
          <dt>Loop</dt>
          <dd>{route.loop ? 'Yes' : 'No'}</dd>
        </div>
        {#if route.stops.length > 0}
          <div>
            <dt>Start</dt>
            <dd class="pt-name">{stopExportName(route.stops[0]!, 0)}</dd>
          </div>
        {/if}
        {#if route.stops.length > 1}
          <div>
            <dt>End</dt>
            <dd class="pt-name">
              {stopExportName(route.stops[route.stops.length - 1]!, route.stops.length - 1)}
            </dd>
          </div>
        {/if}
      </dl>

      {#if route.stops.length > 0}
        <ol class="stop-list">
          {#each route.stops as stop, i (stop.id)}
            <li>
              <span class="num">{i + 1}</span>
              <span class="stop-name">{stopExportName(stop, i)}</span>
              <span class="stop-coords">{formatLatLon(stop)}</span>
            </li>
          {/each}
        </ol>
      {/if}
    </article>

    <div class="actions no-print">
      <button onclick={copyMarkdown}>Copy Markdown</button>
      <button onclick={saveImage} disabled={renderingPng}>{renderingPng ? 'Rendering…' : 'Save image'}</button>
      <button onclick={() => window.print()}>Print / PDF</button>
    </div>

    <section class="gpx-section">
      <div class="gpx-head">
        <h3>GPX</h3>
        <button class="no-print copy-gpx" onclick={copyGpx}>Copy</button>
      </div>
      <pre class="gpx">{gpxText}</pre>
    </section>
  </div>
{/if}

<style>
  .overview {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 16px calc(24px + var(--safe-bottom));
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
  }

  .back {
    font-size: 1.2rem;
  }

  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  .route-name {
    font-size: 1.4rem;
    margin: 8px 0 4px;
  }

  .description {
    color: var(--color-text-dim);
    margin: 0 0 12px;
  }

  .map-wrap {
    display: flex;
    justify-content: center;
    margin: 12px 0;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
    margin: 16px 0;
  }

  .stats div {
    background: var(--color-surface);
    border-radius: var(--radius);
    padding: 10px 14px;
  }

  dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-dim);
  }

  dd {
    margin: 2px 0 0;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .pt-name {
    font-size: 0.95rem;
  }

  .fine {
    display: block;
    font-size: 0.7rem;
    font-weight: 400;
    color: var(--color-text-dim);
  }

  .stop-list {
    list-style: none;
    margin: 16px 0;
    padding: 0;
  }

  .stop-list li {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid var(--color-border);
  }

  .num {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    font-weight: 700;
    flex-shrink: 0;
    align-self: center;
  }

  .stop-name {
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stop-coords {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--color-text-dim);
    font-family: ui-monospace, monospace;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin: 16px 0;
  }

  .actions button {
    flex: 1;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--color-primary);
  }

  .gpx-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .gpx-head h3 {
    margin: 0;
  }

  .copy-gpx {
    color: var(--color-primary);
    font-weight: 600;
  }

  .gpx {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 10px 12px;
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    line-height: 1.45;
    max-height: 40dvh;
    overflow: auto;
    white-space: pre;
    -webkit-user-select: text;
    user-select: text;
  }

  .missing {
    padding: 32px 16px;
    text-align: center;
    color: var(--color-text-dim);
  }

  @media print {
    .no-print {
      display: none !important;
    }

    .overview {
      max-width: none;
      padding: 0;
    }

    .gpx-section {
      break-before: page;
    }

    .gpx {
      max-height: none;
      overflow: visible;
      white-space: pre-wrap;
      word-break: break-all;
      border: none;
      font-size: 8pt;
    }

    .stats div {
      border: 1px solid #ccc;
    }
  }
</style>
