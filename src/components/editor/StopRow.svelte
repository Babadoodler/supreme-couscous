<script lang="ts">
  import type { Stop } from '../../lib/types';
  import { formatLatLon } from '../../lib/geo/format';
  import { stopExportName } from '../../lib/gpx/serialize';

  let {
    stop,
    index,
    onfocus,
    onrename,
    ondelete
  }: {
    stop: Stop;
    index: number;
    onfocus: () => void;
    onrename: (name: string) => void;
    ondelete: () => void;
  } = $props();

  let renaming = $state(false);
  let draft = $state('');

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

<div class="row">
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
    </p>
  </div>
  <button class="delete" onclick={ondelete} aria-label={`Delete stop ${index + 1}`}>✕</button>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    border-bottom: 1px solid var(--color-border);
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

  .delete {
    color: var(--color-text-dim);
    flex-shrink: 0;
  }
</style>
