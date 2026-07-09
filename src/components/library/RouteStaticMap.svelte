<script lang="ts">
  // Static route map with real OSM raster tiles behind the polyline
  // (DESIGN.md §7.8). Progressive enhancement: tiles that fail to load
  // (offline, blocked) simply don't render — the route line and dots sit on
  // the plain surface exactly like the offline minimap.
  import type { LatLon } from '../../lib/types';
  import { computeStaticMapView, osmTileUrl, OSM_TILE_ATTRIBUTION } from '../../lib/geo/tiles';

  let {
    stops,
    loop = false,
    width = 360,
    height = 240
  }: {
    stops: LatLon[];
    loop?: boolean;
    width?: number;
    height?: number;
  } = $props();

  let view = $derived(computeStaticMapView(stops, width, height, 40));
  let points = $derived(view ? stops.map((s) => view!.project(s)) : []);
  let path = $derived(points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  let anyTileLoaded = $state(false);
</script>

<div class="static-map" style="width:{width}px;height:{height}px">
  {#if view}
    {#each view.tiles as t (`${t.z}/${t.x}/${t.y}`)}
      <img
        class="tile"
        style="left:{t.left}px;top:{t.top}px"
        src={osmTileUrl(t.x, t.y, t.z)}
        alt=""
        loading="lazy"
        onload={() => (anyTileLoaded = true)}
        onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
      />
    {/each}
    <svg class="overlay" viewBox="0 0 {width} {height}" {width} {height} aria-hidden="true">
      {#if points.length >= 2}
        <polyline
          points={path}
          fill="none"
          stroke="var(--color-primary)"
          stroke-width="4"
          stroke-linejoin="round"
          stroke-linecap="round"
          opacity="0.9"
        />
        {#if loop && points.length > 2}
          <line
            x1={points[points.length - 1]!.x}
            y1={points[points.length - 1]!.y}
            x2={points[0]!.x}
            y2={points[0]!.y}
            stroke="var(--color-primary)"
            stroke-width="3"
            stroke-dasharray="6 6"
            opacity="0.8"
          />
        {/if}
      {/if}
      {#each points as p, i (i)}
        <circle
          cx={p.x}
          cy={p.y}
          r={i === 0 ? 7 : 5}
          fill={i === 0 ? 'var(--color-primary)' : '#5f6468'}
          stroke="#ffffff"
          stroke-width="2"
        />
      {/each}
    </svg>
    {#if anyTileLoaded}
      <span class="attribution">{OSM_TILE_ATTRIBUTION}</span>
    {/if}
  {/if}
</div>

<style>
  .static-map {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--color-surface);
    max-width: 100%;
    flex-shrink: 0;
  }

  .tile {
    position: absolute;
    width: 256px;
    height: 256px;
    user-select: none;
    pointer-events: none;
  }

  .overlay {
    position: absolute;
    inset: 0;
  }

  .attribution {
    position: absolute;
    right: 4px;
    bottom: 2px;
    font-size: 0.6rem;
    color: #333;
    background: rgba(255, 255, 255, 0.7);
    padding: 0 4px;
    border-radius: 3px;
  }
</style>
