<script lang="ts">
  // The unified add bar (DESIGN.md §7.1). Layer 3 scope: coordinate
  // detection (decimal/DMS/geo:/map URLs) and single GPS fix.
  // Place search plugs into the same field in Layer 4.
  import { parseCoordinateInput } from '../../lib/geo/coordParse';
  import { formatLatLon } from '../../lib/geo/format';
  import type { LatLon, StopSource } from '../../lib/types';

  let { onadd }: { onadd: (pos: LatLon, source: StopSource) => void } = $props();

  let text = $state('');
  let gpsBusy = $state(false);
  let gpsError = $state('');

  let parsed = $derived(parseCoordinateInput(text));

  function addParsed() {
    if (!parsed) return;
    onadd(parsed, 'coords');
    text = '';
  }

  function addGps() {
    gpsError = '';
    if (!navigator.geolocation) {
      gpsError = "This device can't share its location.";
      return;
    }
    gpsBusy = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        gpsBusy = false;
        onadd({ lat: pos.coords.latitude, lon: pos.coords.longitude }, 'gps');
      },
      (err) => {
        gpsBusy = false;
        gpsError =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied.'
            : "Couldn't get a location fix.";
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }
</script>

<div class="addbar">
  <div class="row">
    <input
      type="text"
      bind:value={text}
      placeholder="Paste coords, or tap the map"
      aria-label="Add a stop by coordinates"
      enterkeyhint="done"
      onkeydown={(e) => {
        if (e.key === 'Enter' && parsed) addParsed();
      }}
    />
    <button class="gps" onclick={addGps} disabled={gpsBusy} aria-label="Add my current location">
      {gpsBusy ? '…' : '◎'}
    </button>
  </div>

  {#if parsed}
    <button class="result" onclick={addParsed}>
      📍 {formatLatLon(parsed)} — <strong>Add as stop</strong>
    </button>
  {:else if text.trim().length > 0}
    <p class="hint">Not coordinates — place search arrives in a later update. Tap the map or paste coordinates.</p>
  {/if}
  {#if gpsError}
    <p class="hint error">{gpsError}</p>
  {/if}
</div>

<style>
  .addbar {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .row {
    display: flex;
    gap: 8px;
  }

  input {
    flex: 1;
    min-height: var(--touch-target);
    padding: 0 14px;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    color: var(--color-text);
    outline-color: var(--color-primary);
    min-width: 0;
  }

  .gps {
    border-radius: 50%;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    font-size: 1.2rem;
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .result {
    text-align: left;
    background: var(--color-surface);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius);
    padding: 10px 14px;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-dim);
    padding: 0 6px;
  }

  .error {
    color: var(--color-danger);
  }
</style>
