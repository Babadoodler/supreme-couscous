<script lang="ts">
  import type { Route } from '../../lib/types';
  import MiniMap from './MiniMap.svelte';
  import { relativeTime } from '../../lib/ui/relativeTime';

  let {
    route,
    onopen,
    onoverview,
    onrename,
    onduplicate,
    onexport,
    ondelete
  }: {
    route: Route;
    onopen: () => void;
    onoverview: () => void;
    onrename: (name: string) => void;
    onduplicate: () => void;
    onexport: () => void;
    ondelete: () => void;
  } = $props();

  let menuOpen = $state(false);
  let renaming = $state(false);
  let draftName = $state('');

  function startRename() {
    menuOpen = false;
    draftName = route.name;
    renaming = true;
  }

  function commitRename() {
    renaming = false;
    const name = draftName.trim();
    if (name && name !== route.name) onrename(name);
  }

  function onWindowClick() {
    menuOpen = false;
  }
</script>

<svelte:window onclick={onWindowClick} />

<article class="card">
  <button class="body" onclick={onopen} aria-label={`Open route ${route.name}`}>
    <MiniMap stops={route.stops} loop={route.loop} />
    <div class="info">
      {#if renaming}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="rename"
          bind:value={draftName}
          autofocus
          onblur={commitRename}
          onkeydown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') renaming = false;
          }}
          onclick={(e) => e.stopPropagation()}
        />
      {:else}
        <h2>{route.name}</h2>
      {/if}
      <p class="meta">
        {route.stops.length}
        {route.stops.length === 1 ? 'stop' : 'stops'}
        {#if route.loop}<span class="badge">loop</span>{/if}
      </p>
      <p class="meta dim">Edited {relativeTime(route.updatedAt)}</p>
    </div>
  </button>

  <div class="menu-anchor">
    <button
      class="menu-btn"
      aria-label="Route actions"
      aria-expanded={menuOpen}
      onclick={(e) => {
        e.stopPropagation();
        menuOpen = !menuOpen;
      }}
    >
      ⋮
    </button>
    {#if menuOpen}
      <div class="menu" role="menu">
        <button role="menuitem" onclick={() => { menuOpen = false; onoverview(); }}>Overview</button>
        <button role="menuitem" onclick={startRename}>Rename</button>
        <button role="menuitem" onclick={() => { menuOpen = false; onduplicate(); }}>Duplicate</button>
        <button role="menuitem" onclick={() => { menuOpen = false; onexport(); }}>Export GPX</button>
        <button role="menuitem" class="danger" onclick={() => { menuOpen = false; ondelete(); }}>Delete</button>
      </div>
    {/if}
  </div>
</article>

<style>
  .card {
    display: flex;
    align-items: stretch;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    overflow: visible;
    position: relative;
  }

  .body {
    flex: 1;
    display: flex;
    gap: 12px;
    padding: 12px;
    text-align: left;
    align-items: center;
    min-width: 0;
    border-radius: var(--radius);
  }

  .info {
    min-width: 0;
  }

  h2 {
    font-size: 1rem;
    margin: 0 0 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rename {
    font-size: 1rem;
    font-weight: 600;
    width: 100%;
    border: 1px solid var(--color-primary);
    border-radius: 6px;
    padding: 4px 6px;
    background: var(--color-bg);
    color: var(--color-text);
  }

  .meta {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text);
  }

  .dim {
    color: var(--color-text-dim);
  }

  .badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 8px;
    font-size: 0.75rem;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--color-primary-contrast);
  }

  .menu-anchor {
    position: relative;
    display: flex;
    align-items: flex-start;
  }

  .menu-btn {
    font-size: 1.25rem;
    color: var(--color-text-dim);
    padding: 0 8px;
  }

  .menu {
    position: absolute;
    top: 44px;
    right: 8px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    min-width: 160px;
    z-index: 20;
    overflow: hidden;
  }

  .menu button {
    text-align: left;
    padding: 12px 16px;
  }

  .menu button:hover {
    background: var(--color-surface);
  }

  .danger {
    color: var(--color-danger);
  }
</style>
