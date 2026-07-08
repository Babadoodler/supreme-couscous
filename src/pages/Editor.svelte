<script lang="ts">
  // Layer 2 placeholder — the full editor (map + stop sheet) lands in Layer 3.
  import type { Route } from '../lib/types';
  import { getRoute } from '../lib/store/routes';
  import { gotoLibrary } from '../lib/ui/nav.svelte';

  let { routeId }: { routeId: string } = $props();

  let route = $state<Route | null>(null);
  let missing = $state(false);

  $effect(() => {
    void getRoute(routeId).then((r) => {
      if (r) route = r;
      else missing = true;
    });
  });
</script>

<div class="editor">
  <header>
    <button onclick={gotoLibrary} aria-label="Back to library">←</button>
    <h1>{route?.name ?? (missing ? 'Route not found' : '…')}</h1>
  </header>
  {#if route}
    <p class="placeholder">Editor coming in Layer 3 — {route.stops.length} stops saved.</p>
  {/if}
</div>

<style>
  .editor {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 16px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
  }

  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  .placeholder {
    color: var(--color-text-dim);
  }
</style>
