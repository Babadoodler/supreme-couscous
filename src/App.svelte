<script lang="ts">
  import { nav } from './lib/ui/nav.svelte';
  import Library from './pages/Library.svelte';
  import Snackbar from './components/ui/Snackbar.svelte';

  // Editor is lazy-loaded: it pulls in MapLibre (~230 KB gz), which must stay
  // out of the initial bundle to hold the ≤200 KB budget (DESIGN.md §13).
  const editorModule = import('./pages/Editor.svelte');
</script>

{#if nav.screen === 'editor' && nav.routeId}
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

<Snackbar />

<style>
  .load-error {
    padding: 32px 16px;
    text-align: center;
    color: var(--color-text-dim);
  }
</style>
