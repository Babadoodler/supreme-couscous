<script lang="ts">
  // Static SVG thumbnail of a route — rendered from coordinates only, no
  // tile fetch, so library cards work fully offline (DESIGN.md §6.1).
  import type { Stop } from '../../lib/types';

  let { stops, loop = false }: { stops: Stop[]; loop?: boolean } = $props();

  const W = 96;
  const H = 64;
  const PAD = 8;

  let points = $derived.by(() => {
    if (stops.length === 0) return [] as Array<{ x: number; y: number }>;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const s of stops) {
      minLat = Math.min(minLat, s.lat);
      maxLat = Math.max(maxLat, s.lat);
      minLon = Math.min(minLon, s.lon);
      maxLon = Math.max(maxLon, s.lon);
    }
    // Uniform scale so shapes aren't distorted; degenerate spans centre.
    const spanLat = Math.max(maxLat - minLat, 1e-9);
    const spanLon = Math.max(maxLon - minLon, 1e-9);
    const scale = Math.min((W - 2 * PAD) / spanLon, (H - 2 * PAD) / spanLat);
    const ox = (W - spanLon * scale) / 2;
    const oy = (H - spanLat * scale) / 2;
    return stops.map((s) => ({
      x: ox + (s.lon - minLon) * scale,
      y: oy + (maxLat - s.lat) * scale
    }));
  });

  let path = $derived(points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
</script>

<svg viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true" class="minimap">
  {#if points.length >= 2}
    <polyline points={path} fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    {#if loop && points.length > 2}
      <line
        x1={points[points.length - 1]!.x}
        y1={points[points.length - 1]!.y}
        x2={points[0]!.x}
        y2={points[0]!.y}
        stroke="var(--color-primary)"
        stroke-width="1.5"
        stroke-dasharray="3 3"
      />
    {/if}
  {/if}
  {#each points as p, i (i)}
    <circle cx={p.x} cy={p.y} r={i === 0 ? 3.5 : 2.5} fill={i === 0 ? 'var(--color-primary)' : 'var(--color-text-dim)'} />
  {/each}
  {#if points.length === 0}
    <rect x="0" y="0" width={W} height={H} fill="var(--color-surface)" rx="6" />
  {/if}
</svg>

<style>
  .minimap {
    display: block;
    border-radius: 6px;
    background: var(--color-surface);
    flex-shrink: 0;
  }
</style>
