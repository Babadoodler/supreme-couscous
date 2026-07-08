// Canvas-rendered PNG share card for a route (DESIGN.md §7.8).
// Hand-drawn — no imaging dependency; layout is ours to control.

import type { Route } from '../types';
import { fitPointsToBox } from '../geo/project';
import { routeDistanceMeters } from '../geo/distance';
import { formatDistance } from '../geo/format';
import { estimateWalkMinutes } from '../overview';
import { stopExportName } from '../gpx/serialize';

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

  // Map panel
  const panel = { x: 60, y: 300, w: W - 120, h: 560 };
  ctx.fillStyle = PANEL_BG;
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 24);
  ctx.fill();
  const pts = fitPointsToBox(route.stops, panel.w, panel.h, 56).map((p) => ({
    x: p.x + panel.x,
    y: p.y + panel.y
  }));
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
  ctx.fillText('Made with WayPoint', 60, H - 60);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png');
  });
}
