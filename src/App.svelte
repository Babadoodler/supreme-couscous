<script lang="ts">
  import { nav } from './lib/ui/nav.svelte';
  import Library from './pages/Library.svelte';
  import Editor from './pages/Editor.svelte';
  import Snackbar from './components/ui/Snackbar.svelte';
</script>

{#if nav.screen === 'editor' && nav.routeId}
  {#key nav.routeId}
    <Editor routeId={nav.routeId} />
  {/key}
{:else}
  <Library />
{/if}

<Snackbar />
