<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import type { LatLon, Stop } from '../../lib/types';
  import type { Feature, LineString } from 'geojson';

  let {
    stops,
    loop = false,
    pending = null,
    focusId = null,
    focusTick = 0,
    onmaptap,
    onviewchange = undefined,
    onlivecenter = undefined
  }: {
    stops: Stop[];
    loop?: boolean;
    pending?: LatLon | null;
    focusId?: string | null;
    focusTick?: number;
    onmaptap: (pos: LatLon) => void;
    onviewchange?: (center: LatLon) => void;
    /** rAF-throttled centre updates during pans (crosshair readout). */
    onlivecenter?: (center: LatLon) => void;
  } = $props();

  /** Current map centre (crosshair adjust + search bias). */
  export function getCenter(): LatLon | null {
    if (!map) return null;
    const c = map.getCenter();
    return { lat: c.lat, lon: c.lng };
  }

  /** Ease the view to a position (crosshair adjust entry). */
  export function easeToPos(pos: LatLon, zoom = 16): void {
    map?.easeTo({ center: [pos.lon, pos.lat], zoom: Math.max(map.getZoom(), zoom) });
  }

  // Style URL is deliberately a single constant — swappable tiles (DESIGN.md §12.1).
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
  const MELBOURNE: [number, number] = [144.9631, -37.8136];

  let container: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let styleReady = false;
  let markers: maplibregl.Marker[] = [];
  let pendingMarker: maplibregl.Marker | null = null;

  function lineData(): Feature<LineString> {
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: stops.map((s) => [s.lon, s.lat]) }
    };
  }

  function loopData(): Feature<LineString> {
    const coords =
      loop && stops.length > 2
        ? [
            [stops[stops.length - 1]!.lon, stops[stops.length - 1]!.lat],
            [stops[0]!.lon, stops[0]!.lat]
          ]
        : [];
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords }
    };
  }

  function markerElement(index: number): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'wp-marker' + (index === 0 ? ' wp-marker-start' : '');
    el.textContent = String(index + 1);
    return el;
  }

  function syncMarkers() {
    if (!map) return;
    for (const m of markers) m.remove();
    markers = stops.map((s, i) =>
      new maplibregl.Marker({ element: markerElement(i) }).setLngLat([s.lon, s.lat]).addTo(map!)
    );
  }

  function syncLines() {
    if (!map || !styleReady) return;
    (map.getSource('route-line') as maplibregl.GeoJSONSource | undefined)?.setData(lineData());
    (map.getSource('loop-line') as maplibregl.GeoJSONSource | undefined)?.setData(loopData());
  }

  function syncPending() {
    if (!map) return;
    pendingMarker?.remove();
    pendingMarker = null;
    if (pending) {
      const el = document.createElement('div');
      el.className = 'wp-marker wp-marker-pending';
      el.textContent = '?';
      pendingMarker = new maplibregl.Marker({ element: el })
        .setLngLat([pending.lon, pending.lat])
        .addTo(map);
    }
  }

  function fitToStops(animate: boolean) {
    if (!map || stops.length === 0) return;
    if (stops.length === 1) {
      map.jumpTo({ center: [stops[0]!.lon, stops[0]!.lat], zoom: 15 });
      return;
    }
    const b = new maplibregl.LngLatBounds();
    for (const s of stops) b.extend([s.lon, s.lat]);
    map.fitBounds(b, { padding: 48, maxZoom: 16, animate });
  }

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: MELBOURNE,
      zoom: 12,
      attributionControl: { compact: true }
    });
    map.on('click', (e) => {
      onmaptap({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
    map.on('moveend', () => {
      const c = map?.getCenter();
      if (c) onviewchange?.({ lat: c.lat, lon: c.lng });
    });
    let liveRaf = 0;
    map.on('move', () => {
      if (liveRaf || !onlivecenter) return;
      liveRaf = requestAnimationFrame(() => {
        liveRaf = 0;
        const c = map?.getCenter();
        if (c) onlivecenter?.({ lat: c.lat, lon: c.lng });
      });
    });
    map.on('load', () => {
      map!.addSource('route-line', { type: 'geojson', data: lineData() });
      map!.addSource('loop-line', { type: 'geojson', data: loopData() });
      map!.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-line',
        paint: { 'line-color': '#0f766e', 'line-width': 3, 'line-opacity': 0.85 }
      });
      map!.addLayer({
        id: 'loop-line',
        type: 'line',
        source: 'loop-line',
        paint: {
          'line-color': '#0f766e',
          'line-width': 2.5,
          'line-opacity': 0.7,
          'line-dasharray': [2, 2]
        }
      });
      styleReady = true;
      syncLines();
      // Auto-fit once on open; never re-fit while the user is interacting (§6.2).
      fitToStops(false);
    });
    return () => {
      map?.remove();
      map = null;
    };
  });

  $effect(() => {
    void stops.map((s) => `${s.lat},${s.lon}`).join(';');
    syncMarkers();
    syncLines();
  });

  $effect(() => {
    void loop;
    syncLines();
  });

  $effect(() => {
    void pending;
    syncPending();
  });

  $effect(() => {
    void focusTick;
    if (!focusId || !map) return;
    const stop = stops.find((s) => s.id === focusId);
    if (stop) {
      map.easeTo({ center: [stop.lon, stop.lat], zoom: Math.max(map.getZoom(), 15) });
      const el = markers[stops.indexOf(stop)]?.getElement();
      if (el) {
        el.classList.remove('wp-marker-pulse');
        void el.offsetWidth; // restart the animation
        el.classList.add('wp-marker-pulse');
      }
    }
  });
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
  }

  :global(.wp-marker) {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-primary);
    color: var(--color-primary-contrast);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.85rem;
    border: 2px solid #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    cursor: pointer;
  }

  :global(.wp-marker-start) {
    background: #0d9488;
    width: 32px;
    height: 32px;
  }

  :global(.wp-marker-pending) {
    background: var(--color-danger);
    animation: wp-drop 0.2s ease-out;
  }

  :global(.wp-marker-pulse) {
    animation: wp-pulse 0.6s ease-out;
  }

  @keyframes wp-pulse {
    0% { transform: scale(1); }
    40% { transform: scale(1.35); }
    100% { transform: scale(1); }
  }

  @keyframes wp-drop {
    from { transform: translateY(-8px); opacity: 0.5; }
    to { transform: translateY(0); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.wp-marker-pulse),
    :global(.wp-marker-pending) {
      animation: none;
    }
  }
</style>
