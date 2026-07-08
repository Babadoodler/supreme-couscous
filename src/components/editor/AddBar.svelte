<script lang="ts">
  // The unified add bar (DESIGN.md §7.1): one field, auto-detected input.
  // Coordinates (decimal/DMS/geo:/map URLs) parse locally and take priority;
  // anything else queries the geocoder after a debounce. Results chain —
  // adding keeps the field focused so a list of stops can be entered
  // back-to-back. Plus: clipboard chip and single-fix GPS button.
  import { parseCoordinateInput } from '../../lib/geo/coordParse';
  import { formatDistance, formatLatLon } from '../../lib/geo/format';
  import { bearingDegrees, compassPoint, haversineMeters } from '../../lib/geo/distance';
  import { geocoder, type GeocodeResult } from '../../lib/search/geocoder';
  import type { LatLon, StopSource } from '../../lib/types';

  let {
    onadd,
    bias = null
  }: {
    onadd: (pos: LatLon, source: StopSource, name?: string) => void;
    bias?: LatLon | null;
  } = $props();

  let text = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  let gpsBusy = $state(false);
  let gpsError = $state('');
  let results = $state<GeocodeResult[]>([]);
  let searching = $state(false);
  let searchFailed = $state(false);
  let online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  let clipSuggestion = $state<{ pos: LatLon; raw: string } | null>(null);

  let parsed = $derived(parseCoordinateInput(text));

  // ---- Search (debounced, stale-response-safe) ----
  let searchSeq = 0;

  $effect(() => {
    const q = text.trim();
    if (parsed || q.length < 2 || !online) {
      results = [];
      searching = false;
      searchFailed = false;
      return;
    }
    searching = true;
    searchFailed = false;
    const seq = ++searchSeq;
    const timer = setTimeout(async () => {
      try {
        const found = await geocoder.search(q, bias ?? undefined);
        if (seq === searchSeq) {
          results = found;
          searching = false;
        }
      } catch {
        if (seq === searchSeq) {
          results = [];
          searching = false;
          searchFailed = true;
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  });

  function addParsed() {
    if (!parsed) return;
    onadd(parsed, 'coords');
    text = '';
    inputEl?.focus();
  }

  function addResult(r: GeocodeResult) {
    onadd({ lat: r.lat, lon: r.lon }, 'search', r.name);
    text = '';
    results = [];
    inputEl?.focus(); // chain the next search without re-tapping (§7.1.2)
  }

  function onEnter() {
    if (parsed) addParsed();
    else if (results[0]) addResult(results[0]);
  }

  function distanceLabel(r: GeocodeResult): string {
    if (!bias) return '';
    const d = haversineMeters(bias, r);
    return `${formatDistance(d)} ${compassPoint(bearingDegrees(bias, r))}`;
  }

  // ---- Clipboard assist (§7.1.3): offer, never auto-add, never nag ----
  const dismissedClips = new Set<string>();

  async function checkClipboard() {
    try {
      if (!navigator.clipboard?.readText || !document.hasFocus()) return;
      // Only read when permission is already granted — no permission nagging.
      const perm = await navigator.permissions
        ?.query({ name: 'clipboard-read' as PermissionName })
        .catch(() => null);
      if (!perm || perm.state !== 'granted') return;
      const raw = (await navigator.clipboard.readText()).trim();
      if (!raw || dismissedClips.has(raw)) return;
      const pos = parseCoordinateInput(raw);
      clipSuggestion = pos ? { pos, raw } : null;
    } catch {
      // Clipboard access is best-effort only.
    }
  }

  $effect(() => {
    void checkClipboard();
    const onFocus = () => void checkClipboard();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  });

  function acceptClip() {
    if (!clipSuggestion) return;
    dismissedClips.add(clipSuggestion.raw);
    onadd(clipSuggestion.pos, 'clipboard');
    clipSuggestion = null;
  }

  function dismissClip() {
    if (clipSuggestion) dismissedClips.add(clipSuggestion.raw);
    clipSuggestion = null;
  }

  // ---- Online/offline ----
  $effect(() => {
    const set = () => (online = navigator.onLine);
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => {
      window.removeEventListener('online', set);
      window.removeEventListener('offline', set);
    };
  });

  // ---- GPS single fix ----
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
  {#if clipSuggestion}
    <div class="clip-chip">
      <button class="clip-accept" onclick={acceptClip}>
        📋 Paste {formatLatLon(clipSuggestion.pos)} from clipboard?
      </button>
      <button class="clip-dismiss" onclick={dismissClip} aria-label="Dismiss clipboard suggestion">✕</button>
    </div>
  {/if}

  <div class="row">
    <input
      type="text"
      bind:value={text}
      bind:this={inputEl}
      placeholder="Search, paste coords, or tap the map"
      aria-label="Add a stop by search or coordinates"
      enterkeyhint="go"
      autocomplete="off"
      onkeydown={(e) => {
        if (e.key === 'Enter') onEnter();
      }}
    />
    <button class="gps" onclick={addGps} disabled={gpsBusy} aria-label="Add my current location">
      {gpsBusy ? '…' : '◎'}
    </button>
  </div>

  {#if parsed}
    <button class="result coords-result" onclick={addParsed}>
      📍 {formatLatLon(parsed)} — <strong>Add as stop</strong>
    </button>
  {:else if text.trim().length >= 2}
    {#if !online}
      <p class="hint">Offline — coordinates and map taps still work.</p>
    {:else if searching}
      <p class="hint">Searching…</p>
    {:else if searchFailed}
      <p class="hint error">Couldn't reach the search service. Coordinates and map taps still work.</p>
    {:else if results.length === 0}
      <p class="hint">Couldn't find that place.</p>
    {:else}
      <ul class="results" role="listbox" aria-label="Search results">
        {#each results as r, i (`${r.lat},${r.lon},${i}`)}
          <li>
            <button class="result" onclick={() => addResult(r)}>
              <span class="r-name">{r.name}</span>
              <span class="r-sub">
                {r.locality}{r.locality && bias ? ' · ' : ''}{distanceLabel(r)}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
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

  .clip-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--color-surface);
    border: 1px dashed var(--color-primary);
    border-radius: 999px;
    padding: 0 4px 0 12px;
    font-size: 0.85rem;
  }

  .clip-accept {
    flex: 1;
    text-align: left;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clip-dismiss {
    color: var(--color-text-dim);
    flex-shrink: 0;
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

  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    overflow: hidden;
    max-height: 220px;
    overflow-y: auto;
  }

  .result {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 14px;
  }

  .result:hover {
    background: var(--color-surface);
  }

  .coords-result {
    background: var(--color-surface);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius);
    padding: 10px 14px;
  }

  .r-name {
    display: block;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .r-sub {
    display: block;
    font-size: 0.8rem;
    color: var(--color-text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
