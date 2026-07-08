<script lang="ts">
  // Static SVG thumbnail of a route — rendered from coordinates only, no
  // tile fetch, so it works fully offline (DESIGN.md §6.1, §7.8).
  import type { LatLon } from '../../lib/types';
  import { fitPointsToBox } from '../../lib/geo/project';

  let {
    stops,
    loop = false,
    width = 96,
    height = 64,
    pad = 8
  }: {
    stops: LatLon[];
    loop?: boolean;
    width?: number;
    height?: number;
    pad?: number;
  } = $props();

  let points = $derived(fitPointsToBox(stops, width, height, pad));
  let path = $derived(points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  let strokeW = $derived(Math.max(2, width / 48));
  let dotR = $derived(Math.max(2.5, width / 38));
</script>

<svg viewBox="0 0 {width} {height}" {width} {height} aria-hidden="true" class="minimap">
  {#if points.length >= 2}
    <polyline points={path} fill="none" stroke="var(--color-primary)" stroke-width={strokeW} stroke-linejoin="round" stroke-linecap="round" />
    {#if loop && points.length > 2}
      <line
        x1={points[points.length - 1]!.x}
        y1={points[points.length - 1]!.y}
        x2={points[0]!.x}
        y2={points[0]!.y}
        stroke="var(--color-primary)"
        stroke-width={strokeW * 0.75}
        stroke-dasharray="{strokeW * 1.5} {strokeW * 1.5}"
      />
    {/if}
  {/if}
  {#each points as p, i (i)}
    <circle cx={p.x} cy={p.y} r={i === 0 ? dotR * 1.4 : dotR} fill={i === 0 ? 'var(--color-primary)' : 'var(--color-text-dim)'} />
  {/each}
  {#if points.length === 0}
    <rect x="0" y="0" width={width} height={height} fill="var(--color-surface)" rx="6" />
  {/if}
</svg>

<style>
  .minimap {
    display: block;
    border-radius: 6px;
    background: var(--color-surface);
    flex-shrink: 0;
    max-width: 100%;
    height: auto;
  }
</style>
