<script lang="ts">
  // Pokémon GO screenshot import (DESIGN.md §7.9): on-device OCR → parsed
  // preview → best-effort geocoding of the start/end names. The card holds
  // names, not coordinates, and Niantic POIs are often missing from OSM —
  // misses are placed at the locality anchor and flagged for the
  // Adjust-on-map flow, never silently pretended precise.
  import { ocrImage } from '../../lib/ocr/recognize';
  import { parsePogoCard } from '../../lib/ocr/pogoCard';
  import { geocoder } from '../../lib/search/geocoder';
  import { haversineMeters } from '../../lib/geo/distance';
  import { formatDistance } from '../../lib/geo/format';
  import { createRoute, createStop, saveRoute } from '../../lib/store/routes';
  import { ensurePersistentStorage } from '../../lib/store/settings';
  import { showSnack } from '../../lib/ui/snackbar.svelte';
  import { gotoEditor } from '../../lib/ui/nav.svelte';
  import { notifyLibraryChanged } from '../../lib/ui/importState.svelte';
  import type { LatLon } from '../../lib/types';

  let { file, onclose }: { file: File; onclose: () => void } = $props();

  type Phase = 'ocr' | 'nomatch' | 'preview' | 'creating' | 'error';
  type PointStatus = 'searching' | 'matched' | 'approx' | 'none';

  interface PointDraft {
    label: 'Start' | 'End';
    name: string;
    status: PointStatus;
    pos: LatLon | null;
    matchedLabel: string;
  }

  let phase = $state<Phase>('ocr');
  let progress = $state(0);
  let errorMsg = $state('');
  let name = $state('');
  let description = $state('');
  let locality = $state('');
  let distanceLine = $state('');
  let anchor = $state<LatLon | null>(null);
  let points = $state<PointDraft[]>([]);

  const MATCH_RADIUS_M = 50_000;

  async function resolvePoint(draft: PointDraft) {
    try {
      const hits = await geocoder.search(draft.name, anchor ?? undefined);
      const hit = anchor
        ? hits.find((h) => haversineMeters(anchor!, h) < MATCH_RADIUS_M)
        : hits[0];
      if (hit) {
        draft.status = 'matched';
        draft.pos = { lat: hit.lat, lon: hit.lon };
        draft.matchedLabel = [hit.name, hit.locality].filter(Boolean).join(', ');
        return;
      }
    } catch {
      // fall through to approx/none
    }
    if (anchor) {
      draft.status = 'approx';
      draft.pos = anchor;
    } else {
      draft.status = 'none';
      draft.pos = null;
    }
  }

  $effect(() => {
    void (async () => {
      try {
        const text = await ocrImage(file, (p) => (progress = p));
        const parsed = parsePogoCard(text);
        if (!parsed.name && !parsed.startName && !parsed.endName && !parsed.locality) {
          phase = 'nomatch';
          return;
        }
        name = parsed.name ?? 'Pokémon GO route';
        description = parsed.description;
        locality = parsed.locality ?? '';
        distanceLine =
          parsed.distanceMeters !== null
            ? `${formatDistance(parsed.distanceMeters)}${parsed.durationMin !== null ? ` (${parsed.durationMin} min in-game)` : ''}`
            : '';
        points = (
          [
            parsed.startName ? { label: 'Start' as const, name: parsed.startName } : null,
            parsed.endName ? { label: 'End' as const, name: parsed.endName } : null
          ].filter(Boolean) as Array<{ label: 'Start' | 'End'; name: string }>
        ).map((p) => ({ ...p, status: 'searching' as PointStatus, pos: null, matchedLabel: '' }));
        phase = 'preview';

        // Geocode in the background while the user reviews the text fields.
        if (locality) {
          try {
            const hits = await geocoder.search(locality);
            if (hits[0]) anchor = { lat: hits[0].lat, lon: hits[0].lon };
          } catch {
            anchor = null;
          }
        }
        await Promise.all(points.map(resolvePoint));
      } catch {
        errorMsg = "Couldn't read this image on this device.";
        phase = 'error';
      }
    })();
  });

  const statusText: Record<PointStatus, string> = {
    searching: 'Locating…',
    matched: 'Found',
    approx: 'Not found — will be placed near the route area for you to adjust',
    none: 'Not found — add it by search or map tap in the editor'
  };

  async function create() {
    if (phase === 'creating') return;
    phase = 'creating';
    const route = createRoute(name.trim() || 'Pokémon GO route');
    const descParts = [description.trim()];
    if (distanceLine) descParts.push(`In-game route: ${distanceLine}.`);
    const skipped = points.filter((p) => !p.pos);
    if (skipped.length > 0) {
      descParts.push(`Still to place: ${skipped.map((p) => `${p.label.toLowerCase()} — ${p.name}`).join('; ')}.`);
    }
    route.description = descParts.filter(Boolean).join('\n\n');
    route.stops = points
      .filter((p) => p.pos)
      .map((p) =>
        createStop(
          p.pos!,
          'import',
          p.name,
          p.status === 'approx' ? 'Approximate location — use Edit → Adjust on map' : ''
        )
      );
    await saveRoute(route);
    await ensurePersistentStorage();
    notifyLibraryChanged();
    onclose();
    gotoEditor(route.id);
    const approxCount = points.filter((p) => p.status === 'approx').length;
    showSnack(
      approxCount > 0
        ? `Route created — ${approxCount} stop${approxCount === 1 ? '' : 's'} need adjusting on the map`
        : skipped.length > 0
          ? 'Route created — add the missing stops when ready'
          : 'Route created from screenshot'
    );
  }
</script>

<div
  class="scrim"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  role="presentation"
></div>
<div class="sheet" role="dialog" aria-label="Import from Pokémon GO screenshot">
  <h2>Pokémon GO screenshot</h2>

  {#if phase === 'ocr'}
    <p class="hint">Reading the route card on your device — the image is never uploaded.</p>
    <progress value={progress} max="1"></progress>
  {:else if phase === 'nomatch'}
    <p class="error">Couldn't find a route card in this screenshot. Make sure the route info panel (with the start and end points) is visible.</p>
    <div class="actions">
      <button class="secondary" onclick={onclose}>Close</button>
    </div>
  {:else if phase === 'error'}
    <p class="error">{errorMsg}</p>
    <div class="actions">
      <button class="secondary" onclick={onclose}>Close</button>
    </div>
  {:else}
    <label>
      <span>Route name</span>
      <input bind:value={name} />
    </label>

    {#if locality}
      <p class="hint">📍 {locality}{distanceLine ? ` · ${distanceLine}` : ''}</p>
    {:else if distanceLine}
      <p class="hint">{distanceLine}</p>
    {/if}

    {#each points as p (p.label)}
      <div class="point">
        <span class="point-label">{p.label}</span>
        <div class="point-body">
          <input bind:value={p.name} aria-label={`${p.label} point name`} />
          <p class="status status-{p.status}">
            {#if p.status === 'matched'}
              ✓ {statusText.matched}{p.matchedLabel ? `: ${p.matchedLabel}` : ''}
            {:else}
              {statusText[p.status]}
            {/if}
          </p>
        </div>
      </div>
    {/each}

    {#if description}
      <details>
        <summary>Description</summary>
        <textarea bind:value={description} rows="4"></textarea>
      </details>
    {/if}

    <div class="actions">
      <button class="secondary" onclick={onclose}>Cancel</button>
      <button
        class="primary"
        disabled={phase === 'creating' || points.some((p) => p.status === 'searching')}
        onclick={create}
      >
        {phase === 'creating' ? 'Creating…' : 'Create route'}
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
    max-height: 85dvh;
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
    gap: 12px;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  progress {
    width: 100%;
    accent-color: var(--color-primary);
  }

  .hint {
    margin: 0;
    color: var(--color-text-dim);
    font-size: 0.85rem;
  }

  .error {
    color: var(--color-danger);
    margin: 8px 0;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label span {
    font-size: 0.8rem;
    color: var(--color-text-dim);
  }

  input,
  textarea {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--color-surface);
    color: var(--color-text);
    outline-color: var(--color-primary);
    width: 100%;
  }

  .point {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .point-label {
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 0.78rem;
    font-weight: 700;
    margin-top: 8px;
    min-width: 52px;
    text-align: center;
  }

  .point-body {
    flex: 1;
    min-width: 0;
  }

  .status {
    margin: 4px 0 0;
    font-size: 0.78rem;
    color: var(--color-text-dim);
  }

  .status-matched {
    color: var(--color-primary);
  }

  .status-approx,
  .status-none {
    color: var(--color-danger);
  }

  summary {
    color: var(--color-text-dim);
    cursor: pointer;
    padding: 4px 0;
  }

  textarea {
    margin-top: 6px;
    resize: vertical;
  }

  .actions {
    display: flex;
    gap: 10px;
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
