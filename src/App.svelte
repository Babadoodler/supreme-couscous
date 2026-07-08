<script lang="ts">
  import { nav } from './lib/ui/nav.svelte';
  import { clearImport, importState, requestImport } from './lib/ui/importState.svelte';
  import Library from './pages/Library.svelte';
  import Overview from './pages/Overview.svelte';
  import Snackbar from './components/ui/Snackbar.svelte';
  import ImportSheet from './components/library/ImportSheet.svelte';
  import { showSnack } from './lib/ui/snackbar.svelte';

  // Editor is lazy-loaded: it pulls in MapLibre (~290 KB gz), which must stay
  // out of the initial bundle to hold the ≤200 KB budget (DESIGN.md §13).
  const editorModule = import('./pages/Editor.svelte');

  // Desktop drag-drop import (DESIGN.md §10).
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!/\.gpx$/i.test(file.name) && !file.type.includes('gpx') && !file.type.includes('xml')) {
      showSnack("That doesn't look like a GPX file.");
      return;
    }
    requestImport(file.name, await file.text());
  }
</script>

<svelte:window ondragover={(e) => e.preventDefault()} ondrop={onDrop} />

{#if nav.screen === 'overview' && nav.routeId}
  {#key nav.routeId}
    <Overview routeId={nav.routeId} />
  {/key}
{:else if nav.screen === 'editor' && nav.routeId}
  {#await editorModule then { default: Editor }}
    {#key nav.routeId}
      <Editor routeId={nav.routeId} />
    {/key}
  {:catch}
    <p class="load-error">Couldn't load the editor. Check your connection and reload.</p>
  {/await}
{:else}
  <Library />
{/if}

{#if importState.pending}
  <ImportSheet
    fileName={importState.pending.fileName}
    text={importState.pending.text}
    onclose={clearImport}
  />
{/if}

<Snackbar />

<style>
  .load-error {
    padding: 32px 16px;
    text-align: center;
    color: var(--color-text-dim);
  }
</style>
