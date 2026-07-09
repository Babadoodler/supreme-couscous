// Canvas-rendered PNG share card for a route (DESIGN.md §7.8).
// Hand-drawn — no imaging dependency; layout is ours to control.

import type { Route } from '../types';
import { fitPointsToBox } from '../geo/project';
import { routeDistanceMeters } from '../geo/distance';
import { formatDistance } from '../geo/format';
import { estimateWalkMinutes } from '../overview';
import { stopExportName } from '../gpx/serialize';
import { computeStaticMapView, osmTileUrl, OSM_TILE_ATTRIBUTION, TILE_SIZE } from '../geo/tiles';

function loadTile(url: string, timeoutMs = 4000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // A hung tile request must never hang the export — time out and render plain.
    const timer = setTimeout(() => reject(new Error('tile timeout')), timeoutMs);
    img.crossOrigin = 'anonymous'; // keeps the canvas exportable
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('tile failed'));
    };
    img.src = url;
  });
}

const W = 1080;
const H = 1350;
const TEAL = '#0f766e';
const INK = '#1a1c1e';
const DIM = '#5f6468';
const CARD_BG = '#ffffff';
const PANEL_BG = '#eef1f2';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

export async function renderShareCard(route: Route): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = CARD_BG;
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = TEAL;
  ctx.fillRect(0, 0, W, 240);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(ellipsize(ctx, route.name.trim() || 'Untitled route', W - 120), 60, 105);
  const distance = routeDistanceMeters(route.stops, route.loop);
  const subParts = [`${route.stops.length} ${route.stops.length === 1 ? 'stop' : 'stops'}`];
  if (route.stops.length >= 2) {
    subParts.push(formatDistance(distance), `~${estimateWalkMinutes(distance)} min walk`);
  }
  if (route.loop) subParts.push('loop');
  ctx.font = '400 40px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(subParts.join(' · '), 60, 180);

  // Map panel: real OSM tiles when reachable, plain panel otherwise.
  const panel = { x: 60, y: 300, w: W - 120, h: 560 };
  ctx.fillStyle = PANEL_BG;
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 24);
  ctx.fill();

  let pts: Array<{ x: number; y: number }>;
  let tilesDrawn = false;
  const view = computeStaticMapView(route.stops, panel.w, panel.h, 56);
  if (view) {
    const loaded = await Promise.allSettled(
      view.tiles.map(async (t) => ({ tile: t, img: await loadTile(osmTileUrl(t.x, t.y, t.z)) }))
    );
    const ok = loaded
      .filter(
        (r): r is PromiseFulfilledResult<{ tile: (typeof view.tiles)[0]; img: HTMLImageElement }> =>
          r.status === 'fulfilled'
      )
      .map((r) => r.value);
    if (ok.length > 0) {
      ctx.save();
      roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 24);
      ctx.clip();
      for (const { tile, img } of ok) {
        ctx.drawImage(img, panel.x + tile.left, panel.y + tile.top, TILE_SIZE, TILE_SIZE);
      }
      ctx.restore();
      tilesDrawn = true; // any drawn tile means the view projection is on screen
    }
    pts = route.stops.map((s) => {
      const p = view.project(s);
      return { x: p.x + panel.x, y: p.y + panel.y };
    });
  } else {
    pts = [];
  }
  if (!tilesDrawn && route.stops.length > 0) {
    // Offline/blocked: same projection, plain background (already filled).
    pts = fitPointsToBox(route.stops, panel.w, panel.h, 56).map((p) => ({
      x: p.x + panel.x,
      y: p.y + panel.y
    }));
  }
  if (pts.length >= 2) {
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    if (route.loop && pts.length > 2) {
      ctx.setLineDash([14, 14]);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y);
      ctx.lineTo(pts[0]!.x, pts[0]!.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === 0 ? 16 : 11, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? TEAL : DIM;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });

  // Stop list (up to 8)
  let y = 940;
  const maxRows = 8;
  ctx.textBaseline = 'middle';
  for (const [i, stop] of route.stops.slice(0, maxRows).entries()) {
    ctx.fillStyle = TEAL;
    ctx.beginPath();
    ctx.arc(90, y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 90, y + 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = '400 36px system-ui, sans-serif';
    ctx.fillText(ellipsize(ctx, stopExportName(stop, i), W - 220), 140, y + 2);
    y += 56;
  }
  if (route.stops.length > maxRows) {
    ctx.fillStyle = DIM;
    ctx.font = 'italic 32px system-ui, sans-serif';
    ctx.fillText(`+ ${route.stops.length - maxRows} more stops`, 140, y + 2);
  }

  // Footer
  ctx.fillStyle = DIM;
  ctx.font = '400 30px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Made with WayPoint', 60, H - 60);
  if (tilesDrawn) {
    ctx.textAlign = 'right';
    ctx.font = '400 22px system-ui, sans-serif';
    ctx.fillText(`Map data ${OSM_TILE_ATTRIBUTION}`, W - 60, H - 60);
    ctx.textAlign = 'left';
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png');
  });
}
