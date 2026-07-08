<script lang="ts">
  // Import preview sheet (DESIGN.md §10): parse → preview → confirm.
  // Multi-rte/trk files import as multiple routes via a per-item checklist;
  // tracks over 200 points get a simplification slider (default ~50).
  import { GpxParseError, parseGpx, type ParseResult } from '../../lib/gpx/parse';
  import { simplifyToCount } from '../../lib/gpx/simplify';
  import { createRoute, createStop, saveRoute } from '../../lib/store/routes';
  import { ensurePersistentStorage } from '../../lib/store/settings';
  import { showSnack } from '../../lib/ui/snackbar.svelte';
  import { gotoEditor } from '../../lib/ui/nav.svelte';
  import { notifyLibraryChanged } from '../../lib/ui/importState.svelte';
  import MiniMap from './MiniMap.svelte';

  const SIMPLIFY_THRESHOLD = 200;
  const SIMPLIFY_DEFAULT = 50;

  let { fileName, text, onclose }: { fileName: string; text: string; onclose: () => void } = $props();

  let parseError = $state('');
  let result = $state<ParseResult | null>(null);
  let selected = $state<boolean[]>([]);
  let targetCounts = $state<number[]>([]);
  let importing = $state(false);

  $effect(() => {
    try {
      const parsed = parseGpx(text, { fallbackName: fileName.replace(/\.gpx$/i, '') });
      result = parsed;
      selected = parsed.routes.map(() => true);
      targetCounts = parsed.routes.map((r) =>
        r.points.length > SIMPLIFY_THRESHOLD ? SIMPLIFY_DEFAULT : r.points.length
      );
    } catch (err) {
      parseError = err instanceof GpxParseError ? err.message : 'Something went wrong reading this file.';
    }
  });

  function previewPoints(i: number) {
    const r = result!.routes[i]!;
    return targetCounts[i]! < r.points.length ? simplifyToCount(r.points, targetCounts[i]!) : r.points;
  }

  async function doImport() {
    if (!result || importing) return;
    importing = true;
    const created: string[] = [];
    for (const [i, r] of result.routes.entries()) {
      if (!selected[i]) continue;
      const points = previewPoints(i);
      const route = createRoute(r.name);
      route.description = r.description;
      route.loop = r.loop;
      route.stops = points.map((p) => createStop({ lat: p.lat, lon: p.lon }, 'import', p.name, p.note));
      await saveRoute(route);
      created.push(route.id);
    }
    await ensurePersistentStorage();
    notifyLibraryChanged();
    onclose();
    if (created.length === 1) {
      gotoEditor(created[0]!);
      showSnack('Route imported');
    } else {
      showSnack(`Imported ${created.length} routes`);
    }
  }
</script>

<div
  class="scrim"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  role="presentation"
></div>
<div class="sheet" role="dialog" aria-label="Import GPX">
  <h2>Import GPX</h2>
  <p class="file">{fileName}</p>

  {#if parseError}
    <p class="error">{parseError}</p>
    <div class="actions">
      <button class="secondary" onclick={onclose}>Close</button>
    </div>
  {:else if result}
    {#each result.warnings as w (w)}
      <p class="warning">⚠️ {w}</p>
    {/each}

    <ul class="routes">
      {#each result.routes as r, i (i)}
        <li>
          <label class="route-item">
            <input type="checkbox" bind:checked={selected[i]} />
            <MiniMap stops={previewPoints(i)} loop={r.loop} />
            <div class="route-info">
              <span class="r-name">{r.name}</span>
              <span class="r-meta">
                {r.points.length} points · {r.sourceKind === 'trk' ? 'track' : r.sourceKind === 'rte' ? 'route' : 'waypoints'}{r.loop ? ' · loop' : ''}
              </span>
              {#if r.points.length > SIMPLIFY_THRESHOLD}
                <div class="simplify">
                  <input
                    type="range"
                    min="10"
                    max={Math.min(r.points.length, 500)}
                    bind:value={targetCounts[i]}
                    aria-label={`Simplify ${r.name} to fewer points`}
                  />
                  <span>keep ~{previewPoints(i).length}</span>
                </div>
              {/if}
            </div>
          </label>
        </li>
      {/each}
    </ul>

    <div class="actions">
      <button class="secondary" onclick={onclose}>Cancel</button>
      <button
        class="primary"
        disabled={importing || selected.every((s) => !s)}
        onclick={doImport}
      >
        {importing ? 'Importing…' : `Import ${selected.filter(Boolean).length > 1 ? `${selected.filter(Boolean).length} routes` : 'route'}`}
      </button>
    </div>
  {/if}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 100;
  }

  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 80dvh;
    overflow-y: auto;
    background: var(--color-bg);
    border-radius: var(--radius) var(--radius) 0 0;
    padding: 20px 20px calc(20px + var(--safe-bottom));
    z-index: 101;
    box-shadow: var(--shadow-sheet);
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .file {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
    color: var(--color-text-dim);
    word-break: break-all;
  }

  .error {
    color: var(--color-danger);
    margin: 8px 0;
  }

  .warning {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-text-dim);
  }

  .routes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .route-item {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 10px;
  }

  .route-item input[type='checkbox'] {
    width: 20px;
    height: 20px;
    accent-color: var(--color-primary);
    flex-shrink: 0;
  }

  .route-info {
    min-width: 0;
    flex: 1;
  }

  .r-name {
    display: block;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .r-meta {
    display: block;
    font-size: 0.8rem;
    color: var(--color-text-dim);
  }

  .simplify {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    font-size: 0.8rem;
    color: var(--color-text-dim);
  }

  .simplify input {
    flex: 1;
    accent-color: var(--color-primary);
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
  }

  .actions button {
    flex: 1;
    border-radius: 999px;
    font-weight: 600;
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
  }

  .primary:disabled {
    opacity: 0.5;
  }

  .secondary {
    border: 1px solid var(--color-border);
  }
</style>
