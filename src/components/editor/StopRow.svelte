<script lang="ts">
  import type { Stop } from '../../lib/types';
  import { formatLatLon } from '../../lib/geo/format';
  import { stopExportName } from '../../lib/gpx/serialize';

  let {
    stop,
    index,
    count,
    onfocus,
    onrename,
    ondelete,
    oninsertafter,
    onmove,
    onedit = undefined,
    ondragstart = undefined
  }: {
    stop: Stop;
    index: number;
    count: number;
    onfocus: () => void;
    onrename: (name: string) => void;
    ondelete: () => void;
    oninsertafter: () => void;
    onmove: (delta: -1 | 1) => void;
    onedit?: () => void;
    ondragstart?: (e: PointerEvent) => void;
  } = $props();

  let renaming = $state(false);
  let draft = $state('');
  let menuOpen = $state(false);

  function startRename() {
    draft = stop.name;
    renaming = true;
  }

  function commit() {
    renaming = false;
    if (draft.trim() !== stop.name) onrename(draft.trim());
  }

  const sourceIcons: Record<Stop['source'], string> = {
    map: '📍',
    search: '🔎',
    coords: '⌨️',
    clipboard: '📋',
    gps: '◎',
    import: '📄'
  };
</script>

<svelte:window onclick={() => (menuOpen = false)} />

<div class="row">
  {#if ondragstart}
    <button
      class="handle"
      aria-label={`Drag to reorder stop ${index + 1}`}
      onpointerdown={(e) => ondragstart?.(e)}
    >
      ≡
    </button>
  {/if}
  <button class="order" onclick={onfocus} aria-label={`Show stop ${index + 1} on map`}>
    {index + 1}
  </button>
  <div class="main">
    {#if renaming}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={draft}
        autofocus
        placeholder={`Stop ${index + 1}`}
        onblur={commit}
        onkeydown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') renaming = false;
        }}
      />
    {:else}
      <button class="name" class:unnamed={!stop.name.trim()} onclick={startRename}>
        {stopExportName(stop, index)}
      </button>
    {/if}
    <p class="coords">
      <span class="src" title={`Added via ${stop.source}`}>{sourceIcons[stop.source]}</span>
      {formatLatLon(stop)}
      {#if stop.note.trim()}<span class="note-dot" title={stop.note}>📝</span>{/if}
    </p>
  </div>
  <div class="menu-anchor">
    <button
      class="menu-btn"
      aria-label={`Actions for stop ${index + 1}`}
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
        {#if onedit}
          <button role="menuitem" onclick={() => { menuOpen = false; onedit(); }}>Edit stop</button>
        {/if}
        <button role="menuitem" onclick={() => { menuOpen = false; oninsertafter(); }}>Insert stop after</button>
        <button role="menuitem" disabled={index === 0} onclick={() => { menuOpen = false; onmove(-1); }}>Move up</button>
        <button role="menuitem" disabled={index === count - 1} onclick={() => { menuOpen = false; onmove(1); }}>Move down</button>
        <button role="menuitem" class="danger" onclick={() => { menuOpen = false; ondelete(); }}>Delete</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg);
  }

  .handle {
    color: var(--color-text-dim);
    font-size: 1.1rem;
    cursor: grab;
    touch-action: none;
    flex-shrink: 0;
    min-width: 36px;
  }

  .order {
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    font-weight: 700;
    font-size: 0.85rem;
    flex-shrink: 0;
  }

  .main {
    flex: 1;
    min-width: 0;
  }

  .name {
    display: block;
    width: 100%;
    text-align: left;
    font-weight: 600;
    min-height: 24px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .unnamed {
    color: var(--color-text-dim);
    font-weight: 400;
    font-style: italic;
  }

  .main input {
    width: 100%;
    border: 1px solid var(--color-primary);
    border-radius: 6px;
    padding: 4px 8px;
    background: var(--color-bg);
    color: var(--color-text);
  }

  .coords {
    margin: 0;
    font-size: 0.78rem;
    color: var(--color-text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .src {
    margin-right: 4px;
  }

  .note-dot {
    margin-left: 6px;
  }

  .menu-anchor {
    position: relative;
    flex-shrink: 0;
  }

  .menu-btn {
    color: var(--color-text-dim);
    font-size: 1.1rem;
  }

  .menu {
    position: absolute;
    top: 40px;
    right: 0;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    min-width: 170px;
    z-index: 30;
    overflow: hidden;
  }

  .menu button {
    text-align: left;
    padding: 11px 16px;
  }

  .menu button:disabled {
    color: var(--color-text-dim);
    opacity: 0.5;
  }

  .menu button:not(:disabled):hover {
    background: var(--color-surface);
  }

  .danger {
    color: var(--color-danger);
  }
</style>
