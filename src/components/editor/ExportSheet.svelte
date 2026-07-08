<script lang="ts">
  import type { Route } from '../../lib/types';
  import { serializeGpx, type GpxVariant } from '../../lib/gpx/serialize';
  import { slugifyFilename } from '../../lib/geo/format';
  import { downloadFile, shareOrDownloadFile } from '../../lib/ui/download';
  import { showSnack } from '../../lib/ui/snackbar.svelte';

  let { route, onclose }: { route: Route; onclose: () => void } = $props();

  let variant = $state<GpxVariant>('full');
  let showPreview = $state(false);
  let filename = $derived(slugifyFilename(route.name));
  let gpxText = $derived(serializeGpx(route, { variant }));

  const variantLabels: Record<GpxVariant, string> = {
    full: 'Waypoints + route (best compatibility)',
    'route-only': 'Route only',
    'waypoints-only': 'Waypoints only'
  };

  async function share() {
    await shareOrDownloadFile(filename, gpxText);
    onclose();
    showSnack(`Exported ${filename}`);
  }

  function download() {
    downloadFile(filename, gpxText);
    onclose();
    showSnack(`Exported ${filename}`);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(gpxText);
      showSnack('GPX copied to clipboard');
    } catch {
      showSnack("Couldn't copy — your browser blocked clipboard access.");
    }
  }
</script>

<div
  class="scrim"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  role="presentation"
></div>
<div class="sheet" role="dialog" aria-label="Export GPX">
  <h2>Export GPX</h2>
  <p class="file">{filename}</p>
  <p class="meta">
    {route.stops.length}
    {route.stops.length === 1 ? 'stop' : 'stops'}{route.loop ? ' · closed loop' : ''}
  </p>

  <details>
    <summary>Advanced</summary>
    <div class="variants" role="radiogroup" aria-label="GPX contents">
      {#each Object.entries(variantLabels) as [value, label] (value)}
        <label>
          <input type="radio" name="variant" {value} bind:group={variant} />
          {label}
        </label>
      {/each}
    </div>
  </details>

  <button class="preview-toggle" onclick={() => (showPreview = !showPreview)} aria-expanded={showPreview}>
    {showPreview ? 'Hide GPX' : 'View GPX'}
  </button>
  {#if showPreview}
    <pre class="preview">{gpxText}</pre>
  {/if}

  <div class="actions">
    <button class="secondary" onclick={copy}>Copy</button>
    <button class="secondary" onclick={download}>Download</button>
    <button class="primary" onclick={share}>Share</button>
  </div>
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
    background: var(--color-bg);
    border-radius: var(--radius) var(--radius) 0 0;
    padding: 20px 20px calc(20px + var(--safe-bottom));
    z-index: 101;
    box-shadow: var(--shadow-sheet);
    max-width: 640px;
    margin: 0 auto;
    max-height: 85dvh;
    overflow-y: auto;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 1.1rem;
  }

  .file {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
    color: var(--color-primary);
    word-break: break-all;
  }

  .meta {
    margin: 4px 0 12px;
    color: var(--color-text-dim);
    font-size: 0.85rem;
  }

  details {
    margin-bottom: 12px;
  }

  summary {
    color: var(--color-text-dim);
    cursor: pointer;
    padding: 6px 0;
  }

  .variants {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 4px;
  }

  .variants label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--touch-target);
  }

  .preview-toggle {
    text-align: left;
    color: var(--color-primary);
    font-weight: 600;
    padding: 4px 0;
    min-height: 36px;
  }

  .preview {
    margin: 0 0 12px;
    padding: 10px 12px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    line-height: 1.45;
    max-height: 32dvh;
    overflow: auto;
    white-space: pre;
    -webkit-user-select: text;
    user-select: text;
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

  .secondary {
    border: 1px solid var(--color-border);
  }
</style>
