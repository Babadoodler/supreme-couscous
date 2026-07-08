<script lang="ts">
  // Stop edit sheet (DESIGN.md §7.4): name, note, editable decimal coords,
  // plus the "Adjust on map" crosshair entry point.
  import type { Stop } from '../../lib/types';
  import { isValidLat, isValidLon, normalizeLon } from '../../lib/geo/coordParse';

  let {
    stop,
    index,
    onsave,
    onadjust,
    onclose
  }: {
    stop: Stop;
    index: number;
    onsave: (changes: { name: string; note: string; lat: number; lon: number }) => void;
    onadjust: () => void;
    onclose: () => void;
  } = $props();

  // Drafts intentionally capture the stop's values at open time — edits
  // only apply on Save.
  // svelte-ignore state_referenced_locally
  let name = $state(stop.name);
  // svelte-ignore state_referenced_locally
  let note = $state(stop.note);
  // svelte-ignore state_referenced_locally
  let latText = $state(stop.lat.toFixed(6));
  // svelte-ignore state_referenced_locally
  let lonText = $state(stop.lon.toFixed(6));

  let lat = $derived(Number(latText));
  let lon = $derived(normalizeLon(Number(lonText)));
  let coordsValid = $derived(latText.trim() !== '' && lonText.trim() !== '' && isValidLat(lat) && isValidLon(lon));

  function save() {
    if (!coordsValid) return;
    onsave({ name: name.trim(), note: note.trim(), lat, lon });
    onclose();
  }
</script>

<div
  class="scrim"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  role="presentation"
></div>
<div class="sheet" role="dialog" aria-label={`Edit stop ${index + 1}`}>
  <h2>Edit stop {index + 1}</h2>

  <label>
    <span>Name</span>
    <input bind:value={name} placeholder={`Stop ${index + 1}`} />
  </label>

  <label>
    <span>Note</span>
    <textarea bind:value={note} rows="2" placeholder="Optional note (exports as description)"></textarea>
  </label>

  <div class="coord-row">
    <label>
      <span>Latitude</span>
      <input bind:value={latText} inputmode="decimal" autocomplete="off" />
    </label>
    <label>
      <span>Longitude</span>
      <input bind:value={lonText} inputmode="decimal" autocomplete="off" />
    </label>
  </div>
  {#if !coordsValid}
    <p class="error">Latitude must be -90…90 and longitude -180…180.</p>
  {/if}

  <button class="adjust" onclick={onadjust}>🎯 Adjust position on map</button>

  <div class="actions">
    <button class="secondary" onclick={onclose}>Cancel</button>
    <button class="primary" onclick={save} disabled={!coordsValid}>Save</button>
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
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
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

  textarea {
    resize: vertical;
  }

  .coord-row {
    display: flex;
    gap: 10px;
  }

  .error {
    margin: 0;
    color: var(--color-danger);
    font-size: 0.8rem;
  }

  .adjust {
    text-align: left;
    color: var(--color-primary);
    font-weight: 600;
    padding: 4px 0;
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
