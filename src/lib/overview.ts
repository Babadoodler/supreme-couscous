// Route overview derivations (DESIGN.md §7.8). Pure module.

import type { Route } from './types';
import { routeDistanceMeters } from './geo/distance';
import { formatCoord, formatDistance } from './geo/format';
import { stopExportName } from './gpx/serialize';

/**
 * Display-only walking estimate at a fixed 12 min/km pace over straight-line
 * distance. Never written into the GPX (no travel modes — §2 non-goals).
 */
export function estimateWalkMinutes(meters: number): number {
  if (meters <= 0) return 0;
  return Math.max(1, Math.round((meters / 1000) * 12));
}

function escapeMdCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** The overview as portable Markdown with a coordinates table. */
export function buildMarkdown(route: Route): string {
  const distance = routeDistanceMeters(route.stops, route.loop);
  const first = route.stops[0];
  const last = route.stops[route.stops.length - 1];
  const lines: string[] = [`# ${route.name.trim() || 'Untitled route'}`, ''];
  if (route.description.trim()) {
    lines.push(route.description.trim(), '');
  }
  lines.push(`- **Stops:** ${route.stops.length}`);
  if (route.stops.length >= 2) {
    lines.push(
      `- **Distance:** ${formatDistance(distance)} straight-line · ~${estimateWalkMinutes(distance)} min walk (est.)`
    );
  }
  lines.push(`- **Loop:** ${route.loop ? 'yes — returns to start' : 'no'}`);
  if (first) {
    lines.push(`- **Start:** ${escapeMdCell(stopExportName(first, 0))}`);
  }
  if (last && route.stops.length > 1) {
    lines.push(`- **End:** ${escapeMdCell(stopExportName(last, route.stops.length - 1))}`);
  }
  if (route.stops.length > 0) {
    lines.push('', '| # | Stop | Latitude | Longitude | Note |', '|---|------|----------|-----------|------|');
    route.stops.forEach((s, i) => {
      lines.push(
        `| ${i + 1} | ${escapeMdCell(stopExportName(s, i))} | ${formatCoord(s.lat)} | ${formatCoord(s.lon)} | ${escapeMdCell(s.note.trim())} |`
      );
    });
  }
  lines.push('', '_Created with WayPoint_', '');
  return lines.join('\n');
}
